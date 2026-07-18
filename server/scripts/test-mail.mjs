/**
 * Isolate and diagnose the Graph mailer. Sends ONE test email to the address you
 * pass, using whatever Microsoft credentials are in the environment — so you can
 * run it with the real Render values inline and see the exact Graph error.
 *
 *   cd ICKU/app/server
 *   MS_CLIENT_ID='...' MS_TENANT_ID='...' MS_CLIENT_SECRET='...' MAIL_SENDER='hr@eduport.app' \
 *     node scripts/test-mail.mjs you@gmail.com
 *
 * Copy the three MS_* values from Render → your service → Environment.
 * (Tip: run `unset HISTFILE` first so the secret doesn't land in shell history.)
 */
import { sendMail, mailConfigured } from '../src/lib/mailer.js';
import { env } from '../src/config/env.js';

const to = process.argv[2];
if (!to) {
  console.error('usage: node scripts/test-mail.mjs <recipient-email>');
  process.exit(1);
}

console.log('— config —');
console.log('  clientId set   :', !!env.microsoft.clientId);
console.log('  tenantId set   :', !!env.microsoft.tenantId);
console.log('  clientSecret set:', !!env.microsoft.clientSecret);
console.log('  sender (from)  :', env.mail.sender);
console.log('  mailConfigured :', mailConfigured());
console.log('  sending to     :', to);
console.log('—');

try {
  const r = await sendMail({
    to,
    subject: 'ICKU mail test',
    html: '<p>If you can read this, Graph Mail.Send works and ICKU can email invites.</p>',
  });
  console.log('RESULT:', JSON.stringify(r));
  if (r.sent) console.log('\n✅ Sent. Check the inbox (and spam) for the test message.');
  else console.log('\n⚠️  Not sent —', r.reason, '(credentials likely missing).');
} catch (e) {
  console.error('\n❌ FAILED — this is the exact reason invites are not arriving:\n  ', e.message);
}
