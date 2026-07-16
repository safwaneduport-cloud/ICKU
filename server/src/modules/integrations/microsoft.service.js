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
