/**
 * Outbound email via Microsoft Graph, application permission (Mail.Send).
 *
 * Uses the client-credentials flow with the same Entra app as the per-user
 * calendar connect, so ICKU can send as a real Eduport mailbox (hr@eduport.app)
 * with no user sign-in. This is how meeting invites reach the ~656 staff who
 * have no Microsoft account: an .ics invite lands in their Gmail and adds itself
 * to Google Calendar.
 *
 * Degrades gracefully: with no Microsoft credentials configured (e.g. local dev)
 * it logs the mail and reports { skipped } instead of throwing, so nothing that
 * merely *tries* to send email breaks when email isn't set up.
 */
import { env } from '../config/env.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const tokenUrl = () => `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/token`;

export const mailConfigured = () =>
  !!(env.microsoft.clientId && env.microsoft.tenantId && env.microsoft.clientSecret && env.mail.sender);

// Cache the app token until shortly before it expires (tokens last ~60-90 min).
let cached = { token: null, expiresAt: 0 };

async function appToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60000) return cached.token;
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(tokenUrl(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Graph token error: ${json.error_description || json.error || res.status}`);
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

/**
 * Send one email. `ics` (optional) attaches a calendar invite:
 *   { filename, content, method }  — method REQUEST | CANCEL
 * Returns { sent } or { skipped } / throws on a real Graph failure.
 */
export async function sendMail({ to, subject, html, text, ics }) {
  if (!to) return { skipped: true, reason: 'no recipient' };
  if (!mailConfigured()) {
    console.log(`[mailer] (not configured) would send "${subject}" → ${to}`);
    return { skipped: true, reason: 'not configured' };
  }

  const message = {
    subject,
    body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (ics) {
    message.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: ics.filename || 'invite.ics',
      // The method in the content-type is what makes Gmail/Outlook treat this as
      // an invitation (RSVP + auto-add) rather than a plain file.
      contentType: `text/calendar; method=${ics.method || 'REQUEST'}; charset=UTF-8`,
      contentBytes: Buffer.from(ics.content, 'utf8').toString('base64'),
    }];
  }

  const token = await appToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(env.mail.sender)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: false }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph sendMail ${res.status}: ${err.slice(0, 300)}`);
  }
  return { sent: true };
}
