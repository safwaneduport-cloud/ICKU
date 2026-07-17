// Microsoft 365 (Entra) delegated OAuth — per-user Outlook/Teams calendar connect.
// ICKU never sees the password: the user signs in on Microsoft's own page and we
// receive scoped tokens. Tokens are stored encrypted (lib/secretbox.js).
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { encrypt, decrypt } from '../../lib/secretbox.js';

const SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.ReadWrite', 'OnlineMeetings.ReadWrite'];
const authBase = () => `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0`;

export const isConfigured = () =>
  !!(env.microsoft.clientId && env.microsoft.tenantId && env.microsoft.clientSecret);

// The redirect URI must be byte-identical in the authorize request and the token
// exchange. Both hit the same origin, so we derive it from the request (honouring
// the proxy's x-forwarded-proto in production), unless explicitly overridden.
export function redirectUri(req) {
  if (env.microsoft.redirectUri) return env.microsoft.redirectUri;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.get('host')}/api/v1/integrations/microsoft/callback`;
}

// A signed, short-lived state ties the callback back to the ICKU user who started
// it (the callback carries no auth header), and doubles as CSRF protection.
export function authUrl(userId, req) {
  if (!isConfigured()) throw new ApiError(503, 'Microsoft integration is not configured on the server');
  const state = jwt.sign({ uid: userId, k: 'ms-oauth' }, env.jwt.accessSecret, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
  });
  return `${authBase()}/authorize?${params.toString()}`;
}

async function graphMe(accessToken) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new ApiError(502, 'Could not read your Microsoft profile');
  return r.json();
}

async function exchange(body) {
  const r = await fetch(`${authBase()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.microsoft.clientId,
      client_secret: env.microsoft.clientSecret,
      ...body,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data.error_description || data.error || 'Microsoft token exchange failed';
    throw new ApiError(502, msg.split('\n')[0].slice(0, 200));
  }
  return data; // { access_token, refresh_token, expires_in, scope, ... }
}

// Handle the OAuth redirect: verify state, swap the code for tokens, store them.
export async function handleCallback(code, state, req) {
  let uid;
  try {
    const payload = jwt.verify(state || '', env.jwt.accessSecret);
    if (payload.k !== 'ms-oauth') throw new Error('bad state');
    uid = payload.uid;
  } catch {
    throw new ApiError(400, 'This Microsoft sign-in link has expired — please try connecting again');
  }
  if (!code) throw new ApiError(400, 'Microsoft did not return an authorization code');

  const tok = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req),
    scope: SCOPES.join(' '),
  });
  const me = await graphMe(tok.access_token);

  await prisma.microsoftAccount.upsert({
    where: { userId: uid },
    create: {
      userId: uid,
      msId: me.id,
      email: me.mail || me.userPrincipalName || '',
      displayName: me.displayName || '',
      accessToken: encrypt(tok.access_token),
      refreshToken: encrypt(tok.refresh_token),
      expiresAt: new Date(Date.now() + (tok.expires_in || 3600) * 1000),
      scope: tok.scope || '',
    },
    update: {
      msId: me.id,
      email: me.mail || me.userPrincipalName || '',
      displayName: me.displayName || '',
      accessToken: encrypt(tok.access_token),
      refreshToken: encrypt(tok.refresh_token),
      expiresAt: new Date(Date.now() + (tok.expires_in || 3600) * 1000),
      scope: tok.scope || '',
      connectedAt: new Date(),
    },
  });
  return uid;
}

// A usable access token for `userId` — refreshed if it's within 2 min of expiry.
// Used by the calendar sync (later stages). Returns null if not connected.
export async function accessTokenFor(userId) {
  const acct = await prisma.microsoftAccount.findUnique({ where: { userId } });
  if (!acct) return null;
  if (acct.expiresAt.getTime() - Date.now() > 120000) return decrypt(acct.accessToken);

  try {
    const tok = await exchange({
      grant_type: 'refresh_token',
      refresh_token: decrypt(acct.refreshToken),
      scope: SCOPES.join(' '),
    });
    await prisma.microsoftAccount.update({
      where: { userId },
      data: {
        accessToken: encrypt(tok.access_token),
        refreshToken: tok.refresh_token ? encrypt(tok.refresh_token) : undefined,
        expiresAt: new Date(Date.now() + (tok.expires_in || 3600) * 1000),
        scope: tok.scope || acct.scope,
      },
    });
    return tok.access_token;
  } catch {
    // Refresh token revoked/expired — drop the stale connection so the user reconnects.
    await prisma.microsoftAccount.delete({ where: { userId } }).catch(() => {});
    return null;
  }
}

export async function status(userId) {
  const acct = await prisma.microsoftAccount.findUnique({
    where: { userId },
    select: { email: true, displayName: true, connectedAt: true },
  });
  return {
    configured: isConfigured(),
    connected: !!acct,
    email: acct?.email || null,
    displayName: acct?.displayName || null,
    connectedAt: acct?.connectedAt || null,
  };
}

export async function disconnect(userId) {
  await prisma.microsoftAccount.deleteMany({ where: { userId } });
  return { ok: true };
}

const IST = 'India Standard Time';

// The connected user's Outlook/Teams calendar for a window (poll-on-view — no
// stored copy, always fresh). calendarView expands recurrences within the range.
// Returns times already in IST (via the Prefer header), and the Teams join link.
export async function listCalendar(userId, from, to) {
  const token = await accessTokenFor(userId);
  if (!token) return { connected: false, events: [] };

  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(Date.now() + 30 * 86400e3);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: 'subject,start,end,isAllDay,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,webLink,location,organizer,isCancelled',
    $orderby: 'start/dateTime',
    $top: '100',
  });
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.timezone="${IST}"` },
  });
  if (!r.ok) {
    if (r.status === 401) return { connected: false, events: [] }; // token no longer valid
    throw new ApiError(502, 'Could not read your Microsoft calendar');
  }
  const data = await r.json();
  const events = (data.value || [])
    .filter((e) => !e.isCancelled)
    .map((e) => ({
      id: e.id,
      subject: e.subject || '(no subject)',
      start: e.start?.dateTime || null, // IST local time string
      end: e.end?.dateTime || null,
      allDay: !!e.isAllDay,
      isOnlineMeeting: !!e.isOnlineMeeting,
      joinUrl: e.onlineMeeting?.joinUrl || null,
      webLink: e.webLink || null, // opens the event in Outlook on the web
      location: e.location?.displayName || '',
      organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || '',
    }));
  return { connected: true, events };
}

// Create a real Teams meeting on the owner's Outlook calendar and invite the
// attendees (so it lands in their Outlook too). Returns { id, joinUrl, webLink }.
// Returns null if the owner isn't connected. Times are IST wall-clock strings.
export async function createTeamsEvent(ownerId, { subject, startDateTime, endDateTime, attendees = [], bodyText = '', recurrence = null, location = null }) {
  const token = await accessTokenFor(ownerId);
  if (!token) return null;

  const payload = {
    subject: subject || '(no subject)',
    start: { dateTime: startDateTime, timeZone: IST },
    end: { dateTime: endDateTime, timeZone: IST },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    body: bodyText ? { contentType: 'text', content: bodyText } : undefined,
    recurrence: recurrence || undefined,
    location: location ? { displayName: location } : undefined,
    attendees: attendees
      .filter((a) => a.email)
      .map((a) => ({ emailAddress: { address: a.email, name: a.name || a.email }, type: 'required' })),
  };
  const r = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data.error?.message || 'Could not create the Teams meeting';
    throw new ApiError(502, msg.slice(0, 200));
  }
  return { id: data.id, joinUrl: data.onlineMeeting?.joinUrl || null, webLink: data.webLink || null };
}

// Update a Teams meeting we created (re-issues invites/updates for attendees).
export async function updateTeamsEvent(ownerId, eventId, { subject, startDateTime, endDateTime, attendees = [], bodyText = '', recurrence = null, location = null }) {
  const token = await accessTokenFor(ownerId);
  if (!token || !eventId) return null;
  const payload = {
    subject: subject || '(no subject)',
    start: { dateTime: startDateTime, timeZone: IST },
    end: { dateTime: endDateTime, timeZone: IST },
    body: bodyText ? { contentType: 'text', content: bodyText } : undefined,
    recurrence: recurrence || null, // null clears an existing recurrence
    location: { displayName: location || '' },
    attendees: attendees
      .filter((a) => a.email)
      .map((a) => ({ emailAddress: { address: a.email, name: a.name || a.email }, type: 'required' })),
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(502, data.error?.message?.slice(0, 200) || 'Could not update the Teams meeting');
  return { id: data.id, joinUrl: data.onlineMeeting?.joinUrl || null };
}

// Cancel a Teams meeting we created (sends cancellations to attendees).
export async function deleteTeamsEvent(ownerId, eventId) {
  if (!eventId) return;
  const token = await accessTokenFor(ownerId);
  if (!token) return;
  await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
