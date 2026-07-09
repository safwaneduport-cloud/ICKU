import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

// Ordered approval stages the claim advances through.
export const STAGES = ['manager', 'finance', 'payment', 'paid'];
export const STAGE_LABEL = {
  manager: 'Awaiting manager',
  finance: 'Awaiting finance',
  payment: 'Awaiting payment',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const get = (id) => prisma.expense.findUnique({ where: { id } });

export const listMine = (userId) =>
  prisma.expense.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

export function create(userId, { category, amount, date, description, receiptUrl }) {
  return prisma.expense.create({
    data: { userId, category, amount: Number(amount), date, description, receiptUrl: receiptUrl || null, status: 'manager' },
  });
}

export async function cancel(userId, id) {
  const e = await get(id);
  if (!e || e.userId !== userId) throw new ApiError(404, 'Claim not found');
  if (e.status !== 'manager') throw new ApiError(409, 'Only claims awaiting manager can be cancelled');
  return prisma.expense.update({ where: { id }, data: { status: 'cancelled' } });
}

// Claims from my direct reports currently awaiting manager approval.
export async function managerQueue(managerId) {
  const reports = await prisma.user.findMany({ where: { reportsToId: managerId }, select: { id: true } });
  return prisma.expense.findMany({
    where: { userId: { in: reports.map((r) => r.id) }, status: 'manager' },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export const financeQueue = () =>
  prisma.expense.findMany({
    where: { status: { in: ['finance', 'payment'] } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

export async function advance(id) {
  const e = await get(id);
  if (!e) throw new ApiError(404, 'Claim not found');
  const i = STAGES.indexOf(e.status);
  if (i < 0 || i >= STAGES.length - 1) throw new ApiError(409, 'Claim cannot be advanced');
  return prisma.expense.update({ where: { id }, data: { status: STAGES[i + 1] } });
}

export async function reject(id, reviewerId) {
  const e = await get(id);
  if (!e) throw new ApiError(404, 'Claim not found');
  if (!['manager', 'finance', 'payment'].includes(e.status)) throw new ApiError(409, 'Claim cannot be rejected');
  return prisma.expense.update({ where: { id }, data: { status: 'rejected', reviewedById: reviewerId } });
}
