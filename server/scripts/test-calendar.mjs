/**
 * Diagnose APPLICATION-permission calendar creation on the service mailbox.
 *
 * Creates one test Teams event on MAIL_SENDER's calendar app-only (no user
 * sign-in), with the address you pass as an attendee. Tells us three things we
 * need before reworking meetings to service-account hosting:
 *   1. Can the app create an event on the mailbox? (Calendars.ReadWrite app perm)
 *   2. Does isOnlineMeeting mint a Teams join link under app permissions?
 *   3. Does Exchange invite the attendee? (you check the inbox / calendar)
 *
 *   cd ICKU/app/server
 *   MS_CLIENT_ID='...' MS_TENANT_ID='...' MS_CLIENT_SECRET='...' MAIL_SENDER='hr@eduport.app' \
 *     node scripts/test-calendar.mjs you@gmail.com
 *
 * Copy the three MS_* values from Render → Environment. `unset HISTFILE` first.
 */
const clientId = process.env.MS_CLIENT_ID;
const tenantId = process.env.MS_TENANT_ID;
const clientSecret = process.env.MS_CLIENT_SECRET;
const sender = process.env.MAIL_SENDER || 'hr@eduport.app';
const attendee = process.argv[2];

if (!attendee) { console.error('usage: node scripts/test-calendar.mjs <attendee-email>'); process.exit(1); }
if (!clientId || !tenantId || !clientSecret) { console.error('set MS_CLIENT_ID / MS_TENANT_ID / MS_CLIENT_SECRET'); process.exit(1); }

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function appToken() {
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`token: ${j.error_description || j.error}`);
  return j.access_token;
}

// tomorrow 16:00 IST
const d = new Date(Date.now() + 24 * 3600 * 1000);
const pad = (n) => String(n).padStart(2, '0');
const startLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T16:00:00`;
const endLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T16:30:00`;

const event = {
  subject: 'ICKU service-account calendar test',
  start: { dateTime: startLocal, timeZone: 'India Standard Time' },
  end: { dateTime: endLocal, timeZone: 'India Standard Time' },
  isOnlineMeeting: true,
  onlineMeetingProvider: 'teamsForBusiness',
  body: { contentType: 'text', content: 'Testing whether ICKU can host meetings on a service mailbox app-only.' },
  attendees: [{ emailAddress: { address: attendee, name: attendee }, type: 'required' }],
};

console.log('— config —');
console.log('  service mailbox:', sender);
console.log('  attendee       :', attendee);
console.log('  when           :', startLocal, 'IST');
console.log('—');

try {
  const token = await appToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(sender)}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('\n❌ Event creation FAILED:\n  ', data.error?.code, '—', data.error?.message);
    console.error('\n  → If this is about permissions, the Calendars.ReadWrite (Application) grant is missing or not consented.');
    process.exit(0);
  }
  console.log('✅ Event created on', sender);
  console.log('   eventId  :', data.id?.slice(0, 40) + '…');
  console.log('   Teams link minted:', data.onlineMeeting?.joinUrl ? 'YES ✅' : 'NO ❌ (need OnlineMeetings.ReadWrite.All app perm + access policy)');
  if (data.onlineMeeting?.joinUrl) console.log('   joinUrl  :', data.onlineMeeting.joinUrl.slice(0, 60) + '…');
  console.log('\n👉 Now check:', attendee, '— did an invite arrive AND land on the calendar?');
  console.log('   (Also delete the test event from', sender + "'s calendar afterward.)");
} catch (e) {
  console.error('\n❌ FAILED:', e.message);
}
