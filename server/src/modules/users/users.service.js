import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { getMonth } from '../attendance/attendance.service.js';

const publicSelect = {
  id: true, name: true, email: true, role: true, tier: true,
  designation: true, status: true, departmentId: true, reportsToId: true,
};

export function listUsers() {
  return prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { ...publicSelect, department: { select: { id: true, name: true, color: true } } },
  });
}

export async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...publicSelect,
      department: { select: { id: true, name: true, color: true } },
      reportsTo: { select: { id: true, name: true, designation: true } },
    },
  });
  if (!user) throw new ApiError(404, `User not found: ${id}`);
  return user;
}

export function getDirectReports(id) {
  return prisma.user.findMany({
    where: { reportsToId: id },
    orderBy: { name: 'asc' },
    select: publicSelect,
  });
}

// Rich profile for the profile drawer — cross-module snapshot of a person.
export async function getProfile(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...publicSelect, birthday: true, joinedOn: true,
      department: { select: { id: true, name: true, color: true } },
      reportsTo: { select: { id: true, name: true, designation: true } },
    },
  });
  if (!user) throw new ApiError(404, `User not found: ${id}`);

  const now = new Date();
  const [directReports, duties, assetCount, kudosReceived, month] = await Promise.all([
    prisma.user.findMany({ where: { reportsToId: id }, orderBy: { name: 'asc' }, select: { id: true, name: true, designation: true } }),
    // Read-only — deliberately NOT the personal service (which auto-seeds defaults).
    prisma.duty.findMany({ where: { userId: id }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }], select: { id: true, text: true } }),
    prisma.asset.count({ where: { assignedToId: id } }),
    prisma.kudos.count({ where: { toId: id } }),
    getMonth(id, now.getFullYear(), now.getMonth() + 1),
  ]);

  return {
    ...user, directReports, duties, assetCount, kudosReceived,
    attendance: month.summary,
  };
}
