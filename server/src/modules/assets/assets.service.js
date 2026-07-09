import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { ymd } from '../attendance/attendance.lib.js';

export const listMine = (userId) =>
  prisma.asset.findMany({ where: { assignedToId: userId }, orderBy: { type: 'asc' } });

export const listAll = () =>
  prisma.asset.findMany({ orderBy: { tag: 'asc' }, include: { assignedTo: { select: { id: true, name: true } } } });

export async function create({ type, tag, warranty }) {
  const exists = await prisma.asset.findUnique({ where: { tag } });
  if (exists) throw new ApiError(409, `Asset tag ${tag} already exists`);
  return prisma.asset.create({ data: { type, tag, warranty: warranty?.trim() || '—' } });
}

export const assign = (id, userId) =>
  prisma.asset.update({ where: { id }, data: { assignedToId: userId, assignedDate: ymd(new Date()), returnDate: null } });

export const returnToStock = (id) =>
  prisma.asset.update({ where: { id }, data: { returnDate: ymd(new Date()), assignedToId: null } });
