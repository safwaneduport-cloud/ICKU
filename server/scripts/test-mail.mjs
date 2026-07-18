/**
 * Isolate and diagnose the Graph mailer. Sends ONE test message to the address
 * you pass — as a real calendar invite (.ics attached) — using whatever
 * Microsoft credentials are in the environment. Run it with the real Render
 * values inline to see the exact Graph error, and to confirm both that mail is
 * delivered and that it renders as a calendar invite (Gmail → Google Calendar,
 * Outlook → Outlook).
 *
 *   cd ICKU/app/server
 *   MS_CLIENT_ID='...' MS_TENANT_ID='...' MS_CLIENT_SECRET='...' MAIL_SENDER='hr@eduport.app' \
 *     node scripts/test-mail.mjs you@gmail.com
 *
 * Copy the three MS_* values from Render → your service → Environment.
 * (Tip: run `unset HISTFILE` first so the secret doesn't land in shell history.)
 */
import { sendMail, mailConfigured } from '../src/lib/mailer.js';
import { buildMeetingIcs } from '../src/lib/ics.js';
import { env } from '../src/config/env.js';

const to = process.argv[2];
if (!to) {
  console.error('usage: node scripts/test-mail.mjs <recipient-email>');
  process.exit(1);
}

// A dummy meeting ~tomorrow, so the .ics is a real, acceptable calendar invite.
const d = new Date(Date.now() + 24 * 3600 * 1000);
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const meeting = {
  id: `test-${Date.now()}`, title: 'ICKU invite test', date, time: '15:00',
  durationMin: 30, mode: 'online', meetingLink: 'https://teams.microsoft.com/l/meetup-join/ICKU-TEST',
  recurring: 'One-off', recurEnd: 'never', agenda: ['Confirm this lands in your calendar'],
};
const ics = buildMeetingIcs(meeting, {
  organizer: { name: 'ICKU', email: env.mail.sender },
  attendee: { name: to, email: to },
  method: 'REQUEST', sequence: 0,
  locationLabel: 'Microsoft Teams',
  description: 'This is a test of ICKU meeting invites. If it is on your calendar, delivery works.',
});

console.log('— config —');
console.log('  clientId set   :', !!env.microsoft.clientId);
console.log('  tenantId set   :', !!env.microsoft.tenantId);
console.log('  clientSecret set:', !!env.microsoft.clientSecret);
console.log('  sender (from)  :', env.mail.sender);
console.log('  mailConfigured :', mailConfigured());
console.log('  sending invite to:', to, `(for ${date} 15:00 IST)`);
console.log('—');

try {
  const r = await sendMail({
    to,
    subject: 'ICKU invite test',
    html: '<p>This is a test ICKU meeting invite. If it shows on your calendar with a Join button, invites work.</p>',
    ics: { filename: 'invite.ics', content: ics, method: 'REQUEST' },
  });
  console.log('RESULT:', JSON.stringify(r));
  if (r.sent) console.log('\n✅ Sent. Check the inbox AND spam, and whether it was added to the calendar.');
  else console.log('\n⚠️  Not sent —', r.reason, '(credentials likely missing).');
} catch (e) {
  console.error('\n❌ FAILED — this is the exact reason invites are not arriving:\n  ', e.message);
}
