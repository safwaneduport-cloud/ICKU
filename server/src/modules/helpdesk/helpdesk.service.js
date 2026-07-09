import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { ymd } from '../attendance/attendance.lib.js';

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
