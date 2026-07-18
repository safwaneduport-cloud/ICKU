/**
 * Email meeting invites as .ics, so a meeting scheduled in ICKU lands on each
 * attendee's calendar — Outlook for the ~14 with an Eduport mailbox, Google
 * Calendar for the ~656 on Gmail. This is the universal path the user asked for:
 * "if a user has no Microsoft account, send the meeting link via their Gmail and
 * add it to their Google Calendar."
 *
 * Routing reuses the Stage-1 delivery rule (eduportEmail || googleEmail). ICKU
 * is the single inviter — the Outlook event we create on a connected owner's
 * calendar carries NO attendees (see meetings.service), so nobody is double-
 * invited. Everything here is best-effort: a mail failure never breaks the
 * meeting write.
 */
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { buildMeetingIcs } from '../../lib/ics.js';
import { sendMail } from '../../lib/mailer.js';
import { deliveryAddressFor, MAIL_FIELDS } from '../../lib/mail-address.js';

const roomLabel = (m) => (!m.room ? null : m.room === 'Others' ? (m.roomOther || 'Other room') : m.room);

// "Mon 20 Jul 2026, 3:00 PM IST" from the stored IST wall-clock strings.
function whenLabel(m) {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [h, mi] = (m.time || '10:00').split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h, mi);
  const date = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time} IST`;
}

function htmlBody(m, { locationLabel, cancelled, organizerName }) {
  const link = m.meetingLink;
  const rows = [
    ['When', whenLabel(m) + (m.recurring && m.recurring !== 'One-off' ? ` · repeats ${m.recurring.toLowerCase()}` : '')],
    ['Where', locationLabel || (m.mode === 'offline' ? 'In person' : 'Online')],
    organizerName ? ['Organiser', organizerName] : null,
  ].filter(Boolean);

  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;color:#1c1c1c">
      <h2 style="margin:0 0 4px;color:#134535">${cancelled ? 'Cancelled: ' : ''}${escapeHtml(m.title)}</h2>
      <p style="margin:0 0 16px;color:#5E635B">${cancelled ? 'This meeting has been cancelled.' : 'You are invited to this meeting. It has been added to the attached calendar invite.'}</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5E635B;vertical-align:top">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      ${link && !cancelled ? `<p style="margin:20px 0"><a href="${escapeAttr(link)}" style="background:#134535;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Join the meeting</a></p><p style="font-size:12px;color:#5E635B;word-break:break-all">${escapeHtml(link)}</p>` : ''}
      ${m.agenda?.length && !cancelled ? `<p style="margin:16px 0 4px;color:#5E635B;font-size:13px">Agenda</p><ul style="margin:0;padding-left:18px;font-size:14px">${m.agenda.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
      <p style="margin-top:24px;font-size:12px;color:#9aa">Sent by ICKU on behalf of ${escapeHtml(organizerName || 'Eduport')}.</p>
    </div>`;
}

const escapeHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s = '') => escapeHtml(s).replace(/"/g, '&quot;');

/**
 * Send (or cancel) calendar invites for a meeting. Best-effort; returns a tally.
 * @param method 'REQUEST' to invite/update, 'CANCEL' to withdraw.
 */
export async function sendMeetingInvites(meetingId, { method = 'REQUEST' } = {}) {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      owner: { select: MAIL_FIELDS },
      attendees: { include: { user: { select: MAIL_FIELDS } } },
    },
  });
  if (!m) return { sent: 0, skipped: 0, failed: 0 };

  const organizer = { name: m.owner?.name || 'ICKU', email: env.mail.sender };
  const online = m.mode !== 'offline';
  const locationLabel = [roomLabel(m), online ? 'Microsoft Teams' : null].filter(Boolean).join(' · ');

  const descLines = [];
  if (m.agenda?.length) descLines.push('Agenda:', ...m.agenda.map((a) => `- ${a}`), '');
  if (m.meetingLink) descLines.push(`Join: ${m.meetingLink}`, '');
  descLines.push(`Organised by ${m.owner?.name || 'ICKU'} · via ICKU`);
  const description = descLines.join('\n');

  // Everyone on the meeting, except the owner when they already hold the Outlook
  // copy we created on their own calendar (avoids a duplicate for them).
  const recipients = m.attendees.map((a) => a.user).filter((u) => !(m.msEventId && u.id === m.ownerId));

  const results = { sent: 0, skipped: 0, failed: 0, unreachable: [] };
  for (const u of recipients) {
    const to = deliveryAddressFor(u);
    if (!to) { results.skipped++; results.unreachable.push(u.name); continue; }
    const ics = buildMeetingIcs(m, {
      organizer, attendee: { name: u.name, email: to },
      method, sequence: m.inviteSeq || 0, locationLabel, description,
    });
    try {
      const r = await sendMail({
        to,
        subject: `${method === 'CANCEL' ? 'Cancelled: ' : ''}${m.title}`,
        html: htmlBody(m, { locationLabel, cancelled: method === 'CANCEL', organizerName: m.owner?.name }),
        ics: { filename: 'invite.ics', content: ics, method },
      });
      if (r.sent) results.sent++; else results.skipped++;
    } catch (e) {
      results.failed++;
      console.error(`[invites] meeting ${m.id} → ${to}: ${e.message}`);
    }
  }
  return results;
}
