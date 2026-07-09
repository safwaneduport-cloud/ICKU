import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { computeState } from '../events/events.lib.js';

// One hub per department — its people, events and knowledge docs in one place.
export async function list() {
  const [depts, events] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true, knowledgeDocs: true } } } }),
    prisma.event.findMany({ where: { approval: { not: 'rejected' } }, select: { owner: { select: { departmentId: true } } } }),
  ]);
  const evByDept = {};
  for (const e of events) { const d = e.owner?.departmentId; if (d) evByDept[d] = (evByDept[d] || 0) + 1; }
  return depts.map((d) => ({ id: d.id, name: d.name, color: d.color, members: d._count.users, docs: d._count.knowledgeDocs, events: evByDept[d.id] || 0 }));
}

export async function get(deptId) {
  const department = await prisma.department.findUnique({ where: { id: deptId } });
  if (!department) throw new ApiError(404, 'Department not found');

  const [members, events, docs] = await Promise.all([
    prisma.user.findMany({ where: { departmentId: deptId }, orderBy: { name: 'asc' }, select: { id: true, name: true, designation: true, tier: true } }),
    prisma.event.findMany({
      where: { owner: { departmentId: deptId }, approval: { not: 'rejected' } },
      select: { id: true, name: true, status: true, triggerMonth: true, triggerDay: true, tasks: { select: { completed: true } } },
    }),
    prisma.knowledgeDoc.findMany({ where: { departmentId: deptId }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, type: true } }),
  ]);

  const now = new Date();
  const eventsOut = events
    .map((e) => ({ id: e.id, name: e.name, status: e.status, triggerMonth: e.triggerMonth, triggerDay: e.triggerDay, state: computeState(e, now) }))
    .sort((a, b) => ({ overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 }[a.state] - { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 }[b.state]));

  return { department, members, events: eventsOut, docs };
}
