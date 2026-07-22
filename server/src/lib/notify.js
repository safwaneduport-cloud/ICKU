// Email notifications for action-triggered events (task assigned, @mention,
// approval needed). Delivery reuses the Stage-1 rule — eduportEmail, else
// googleEmail (lib/mail-address). All sends are fire-and-forget and swallow
// errors: a notification must never break the action that triggered it. When
// mail isn't configured (local dev) the mailer just logs and skips.
import { prisma } from '../config/prisma.js';
import { sendMail, mailConfigured } from './mailer.js';
import { deliveryAddressFor, MAIL_FIELDS } from './mail-address.js';

const APP_URL = 'https://icku.onrender.com';
const esc = (s = '') => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function wrap({ name, heading, lines = [], cta }) {
  const paras = lines.filter(Boolean).map((l) => `<p style="margin:0 0 10px;color:#333;font-size:14px;line-height:1.5">${l}</p>`).join('');
  const button = cta ? `<a href="${APP_URL}${cta.path}" style="display:inline-block;margin-top:6px;background:#134535;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${esc(cta.label)}</a>` : '';
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;padding:8px">
    <h2 style="color:#134535;margin:0 0 12px;font-size:18px">${esc(heading)}</h2>
    <p style="margin:0 0 12px;color:#555;font-size:14px">Hi ${esc(name) || 'there'},</p>
    ${paras}${button}
    <p style="margin:18px 0 0;color:#999;font-size:12px">Sent by ICKU · Eduport. Open the app for full details.</p>
  </div>`;
}

// Look up the recipient's mailbox and send. Never throws.
async function emailUser(userId, subject, opts) {
  try {
    if (!userId || userId === 'ceo') return; // 'ceo' is a legacy demo id with no mailbox
    const u = await prisma.user.findUnique({ where: { id: userId }, select: MAIL_FIELDS });
    const to = deliveryAddressFor(u);
    if (!to) return;
    await sendMail({ to, subject, html: wrap({ name: u.name, ...opts }) });
  } catch (e) {
    console.error('[notify] email failed:', e.message);
  }
}

export function notifyTaskAssigned(userId, { title, project, by, dueText }) {
  emailUser(userId, `New task: ${title}`, {
    heading: 'A task was assigned to you',
    lines: [
      `<strong>${esc(title)}</strong>${project ? ` in <em>${esc(project)}</em>` : ''}`,
      by ? `Assigned by ${esc(by)}.` : '',
      dueText ? `Due ${esc(dueText)}.` : '',
    ],
    cta: { label: 'View in ICKU', path: '/events' },
  });
}

export function notifyApprovalNeeded(approverId, { kind, title, by }) {
  emailUser(approverId, `Approval needed: ${title}`, {
    heading: `A ${kind} needs your approval`,
    lines: [`<strong>${esc(title)}</strong>`, by ? `From ${esc(by)}.` : ''],
    cta: { label: 'Review in Approvals', path: '/approvals' },
  });
}

export function notifyExtensionRequest(ownerId, { task, project, by, newDate }) {
  emailUser(ownerId, `Extension requested: ${task}`, {
    heading: 'A deadline extension was requested',
    lines: [
      `<strong>${esc(task)}</strong>${project ? ` in <em>${esc(project)}</em>` : ''}`,
      by ? `Requested by ${esc(by)}.` : '',
      newDate ? `Proposed new due date: ${esc(newDate)}.` : '',
    ],
    cta: { label: 'Review in Approvals', path: '/approvals' },
  });
}

export function notifyMention(userId, { by, where, snippet }) {
  emailUser(userId, `${by} mentioned you`, {
    heading: `${esc(by)} mentioned you`,
    lines: [where ? `In <em>${esc(where)}</em>:` : '', snippet ? `“${esc(snippet.slice(0, 200))}”` : ''],
    cta: { label: 'Open Messages', path: '/messages' },
  });
}

// Given freshly-created assignee links [{userId, approval, approverId}], email
// each approved recipient (task is live for them) and each pending recipient's
// manager (they must approve it). Skips notifying the assigner about their own.
export function notifyAssignments(links, { title, project, by, dueText, assignerId } = {}) {
  for (const l of links) {
    if (l.userId === assignerId) continue;
    if (l.approval === 'approved') notifyTaskAssigned(l.userId, { title, project, by, dueText });
    else if (l.approval === 'pending' && l.approverId) notifyApprovalNeeded(l.approverId, { kind: 'task', title, by });
  }
}

export { mailConfigured };
