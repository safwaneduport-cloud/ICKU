import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canHelpdesk } from '../../lib/access.js';
import { ymd } from '../attendance/attendance.lib.js';

// A ticket is visible to the person who raised it and to helpdesk agents.
async function loadFor(user, id) {
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (!t) throw new ApiError(404, 'Ticket not found');
  if (t.userId !== user.id && !canHelpdesk(user)) throw new ApiError(403, 'This ticket is not yours');
  return t;
}

export async function get(user, id) {
  await loadFor(user, id);
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } },
    },
  });
}

export async function addComment(user, id, body) {
  const t = await loadFor(user, id);
  const text = (body || '').trim();
  if (!text) throw new ApiError(400, 'Write something first');
  await prisma.ticketComment.create({ data: { ticketId: id, authorId: user.id, body: text } });

  // First responder owns it: an agent replying to an unassigned ticket picks it
  // up. Without this they'd never be notified of the reply (read marks only track
  // the raiser and the assignee), and the ticket would sit "awaiting assignment"
  // while a conversation was already underway.
  if (!t.assigneeId && t.status === 'open' && canHelpdesk(user) && t.userId !== user.id) {
    await prisma.ticket.update({ where: { id }, data: { assigneeId: user.id, status: 'assigned' } });
  }

  // Commenting counts as having read the thread up to now.
  await markRead(user, id).catch(() => {});
  await prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
  return get(user, id);
}

// Stamp the read mark for whichever side of the ticket this user is on.
export async function markRead(user, id) {
  const t = await loadFor(user, id);
  const data = {};
  if (t.userId === user.id) data.raiserReadAt = new Date();
  if (t.assigneeId === user.id) data.assigneeReadAt = new Date();
  if (Object.keys(data).length) await prisma.ticket.update({ where: { id }, data });
  return { ok: true };
}

// What the notification bell needs: unread replies on my tickets, plus the agent
// queue counts. Computed at read-time — no cron, consistent with the rest of ICKU.
export async function bellFor(user) {
  const mine = await prisma.ticket.findMany({
    where: { OR: [{ userId: user.id }, { assigneeId: user.id }], status: { not: 'closed' } },
    include: { comments: { select: { authorId: true, createdAt: true } } },
  });
  const unread = mine.filter((t) => {
    const since = t.userId === user.id ? t.raiserReadAt : t.assigneeReadAt;
    return t.comments.some((c) => c.authorId !== user.id && (!since || c.createdAt > since));
  });

  let awaitingAssignment = 0;
  let assignedToMe = 0;
  if (canHelpdesk(user)) {
    awaitingAssignment = await prisma.ticket.count({ where: { status: 'open' } });
    assignedToMe = await prisma.ticket.count({ where: { assigneeId: user.id, status: 'assigned' } });
  }
  return { unread, awaitingAssignment, assignedToMe };
}

export const listMine = (userId) =>
  prisma.ticket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { assignee: { select: { id: true, name: true } } },
  });

export const listQueue = () =>
  prisma.ticket.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
  });

export const create = (userId, { category, subject }) =>
  prisma.ticket.create({ data: { userId, category, subject, status: 'open', raised: ymd(new Date()) } });

export const assign = (id, assigneeId) =>
  prisma.ticket.update({ where: { id }, data: { assigneeId, status: 'assigned' } });

export async function setStatus(id, status) {
  if (!['open', 'assigned', 'resolved', 'closed'].includes(status)) throw new ApiError(400, 'Invalid status');
  return prisma.ticket.update({ where: { id }, data: { status } });
}
