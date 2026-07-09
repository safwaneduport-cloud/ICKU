import { prisma } from '../../config/prisma.js';

export function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
}
