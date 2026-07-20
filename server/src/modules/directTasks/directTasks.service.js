import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';

async function isManagerOf(managerId, userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { reportsToId: true } });
  return u?.reportsToId === managerId;
}

const include = {
  assigner: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
};

function isOverdue(t) {
  if (t.completed || !t.dueDate) return false;
  return new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`) < new Date();
}
function shape(t) {
  return {
    id: t.id, title: t.title, assignerId: t.assignerId, assignerName: t.assigner?.name,
    dueDate: t.dueDate, dueTime: t.dueTime, approval: t.approval, approverId: t.approverId,
    completed: t.completed, overdue: isOverdue(t),
    assignees: (t.assignees || []).map((a) => ({ id: a.userId, name: a.user?.name, status: a.status, rejectedReason: a.rejectedReason })),
  };
}

export async function create(assigner, { title, assigneeIds = [], dueDate, dueTime } = {}) {
  if (!title?.trim()) throw new ApiError(400, 'Task title is required');
  if (!assigneeIds.length) throw new ApiError(400, 'Assign the task to at least one person');
  // Gated by the assigner's task-approval mode: auto → active now; manual →
  // pending the assigner's manager, hidden from assignees until approved.
  const isCeo = assigner.id === 'ceo';
  const u = await prisma.user.findUnique({ where: { id: assigner.id }, select: { reportsToId: true, autoApproveTasks: true } });
  const autoApprove = isCeo || u?.autoApproveTasks !== false;
  const t = await prisma.directTask.create({
    data: {
      title: title.trim(), assignerId: assigner.id, dueDate: dueDate || null, dueTime: dueTime || null,
      approval: autoApprove ? 'approved' : 'pending', approverId: autoApprove ? null : (u?.reportsToId || 'ceo'),
      assignees: { create: [...new Set(assigneeIds)].map((userId) => ({ userId })) },
    },
    include,
  });
  return shape(t);
}

// Tasks assigned TO me — only once approved (pending ones stay hidden).
export async function listForUser(userId) {
  const rows = await prisma.directTask.findMany({
    where: { approval: 'approved', assignees: { some: { userId } } },
    orderBy: { createdAt: 'desc' }, include,
  });
  return rows.map(shape);
}
// Tasks I assigned (any status).
export async function listAssignedBy(assignerId) {
  const rows = await prisma.directTask.findMany({ where: { assignerId }, orderBy: { createdAt: 'desc' }, include });
  return rows.map(shape);
}

export async function get(id) {
  const t = await prisma.directTask.findUnique({ where: { id }, include });
  if (!t) throw new ApiError(404, 'Task not found');
  return shape(t);
}

// The assigner's manager approves/rejects a pending task.
export async function decide(actor, id, decision) {
  const t = await prisma.directTask.findUnique({ where: { id } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.approval !== 'pending') throw new ApiError(409, 'Task is not pending approval');
  if (t.approverId !== actor.id && !canAdmin(actor)) throw new ApiError(403, "Only the assigner's manager can decide this");
  return shape(await prisma.directTask.update({ where: { id }, data: { approval: decision === 'approved' ? 'approved' : 'rejected' }, include }));
}

export async function toggleComplete(actor, id) {
  const t = await prisma.directTask.findUnique({ where: { id }, include: { assignees: true } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (!t.assignees.some((a) => a.userId === actor.id) && t.assignerId !== actor.id && !canAdmin(actor)) {
    throw new ApiError(403, 'Only an assignee or the assigner can update this');
  }
  const done = !t.completed;
  return shape(await prisma.directTask.update({ where: { id }, data: { completed: done, completedAt: done ? new Date() : null }, include }));
}

// An assignee — or their manager — rejects that person's assignment.
export async function rejectAssignment(actor, id, { forUserId, reason } = {}) {
  const target = forUserId || actor.id;
  const link = await prisma.directTaskAssignee.findUnique({ where: { taskId_userId: { taskId: id, userId: target } } });
  if (!link) throw new ApiError(404, 'That person is not assigned to this task');
  if (target !== actor.id && !(await isManagerOf(actor.id, target)) && !canAdmin(actor)) {
    throw new ApiError(403, 'Only the assignee or their manager can reject this');
  }
  return prisma.directTaskAssignee.update({
    where: { taskId_userId: { taskId: id, userId: target } },
    data: { status: 'rejected', rejectedReason: (reason || '').trim() || null },
  });
}

// Direct tasks awaiting my approval (I'm the assigner's manager).
export function pendingApprovals(approverId) {
  return prisma.directTask.findMany({ where: { approval: 'pending', approverId }, orderBy: { createdAt: 'desc' }, include }).then((r) => r.map(shape));
}

export async function remove(actor, id) {
  const t = await prisma.directTask.findUnique({ where: { id } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.assignerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the assigner can delete this');
  await prisma.directTask.delete({ where: { id } });
  return { ok: true };
}
