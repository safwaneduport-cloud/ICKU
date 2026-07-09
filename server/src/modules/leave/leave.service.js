import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { leaveDays } from './leave.lib.js';

export const listTypes = () => prisma.leaveType.findMany({ orderBy: { sort: 'asc' } });

// Balance per type for a given year: used = approved days, pending = pending days.
export async function getBalances(userId, year) {
  const types = await prisma.leaveType.findMany({ orderBy: { sort: 'asc' } });
  const reqs = await prisma.leaveRequest.findMany({
    where: { userId, fromDate: { startsWith: String(year) } },
  });
  const sum = (typeId, status) =>
    reqs.filter((r) => r.typeId === typeId && r.status === status).reduce((a, r) => a + r.days, 0);
  return types.map((t) => {
    const used = sum(t.id, 'approved');
    return { ...t, used, pending: sum(t.id, 'pending'), balance: Math.max(0, t.total - used) };
  });
}

export const listMyRequests = (userId) =>
  prisma.leaveRequest.findMany({ where: { userId }, orderBy: { fromDate: 'desc' }, include: { type: true } });

export async function createRequest(userId, typeId, from, to, half, reason) {
  const type = await prisma.leaveType.findUnique({ where: { id: typeId } });
  if (!type) throw new ApiError(400, 'Unknown leave type');
  const toDate = half ? from : to;
  if (toDate < from) throw new ApiError(400, 'End date is before start date');
  const days = leaveDays(from, toDate, half);
  return prisma.leaveRequest.create({
    data: { userId, typeId, fromDate: from, toDate, days, half, reason, status: 'pending' },
  });
}

export async function cancelRequest(userId, id) {
  const r = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!r || r.userId !== userId) throw new ApiError(404, 'Request not found');
  if (r.status !== 'pending') throw new ApiError(409, 'Only pending requests can be cancelled');
  return prisma.leaveRequest.update({ where: { id }, data: { status: 'cancelled' } });
}

export async function listTeam(managerId) {
  const reports = await prisma.user.findMany({ where: { reportsToId: managerId }, select: { id: true } });
  const ids = reports.map((r) => r.id);
  return prisma.leaveRequest.findMany({
    where: { userId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    include: { type: true, user: { select: { id: true, name: true } } },
  });
}

export async function review(id, reviewerId, decision) {
  const r = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!r) throw new ApiError(404, 'Request not found');
  if (r.status !== 'pending') throw new ApiError(409, 'Request has already been actioned');
  return prisma.leaveRequest.update({ where: { id }, data: { status: decision, reviewedById: reviewerId } });
}
