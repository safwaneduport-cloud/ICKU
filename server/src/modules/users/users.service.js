import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

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
