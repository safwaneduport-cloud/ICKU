import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';
import { gateFor } from '../../lib/taskGate.js';
import { notifyAssignments, notifyTaskAssigned } from '../../lib/notify.js';
import { effectiveDue, triggerDate } from '../events/events.lib.js';
import { logActivity } from '../events/events.service.js';

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
  const assignees = (t.assignees || []).map((a) => ({
    id: a.userId, name: a.user?.name, status: a.status,
    approval: a.approval, approverId: a.approverId, rejectedReason: a.rejectedReason,
  }));
  // Task-level summary for the assigner's list: pending if anyone's still waiting
  // on their manager, else approved (each recipient is gated independently).
  const approval = assignees.some((a) => a.approval === 'pending') ? 'pending' : 'approved';
  return {
    id: t.id, title: t.title, description: t.description || '', assignerId: t.assignerId, assignerName: t.assigner?.name,
    dueDate: t.dueDate, dueTime: t.dueTime, approval,
    completed: t.completed, overdue: isOverdue(t), assignees,
  };
}

export async function create(assigner, { title, description = '', assigneeIds = [], dueDate, dueTime } = {}) {
  if (!title?.trim()) throw new ApiError(400, 'Task title is required');
  const ids = [...new Set(assigneeIds)];
  if (!ids.length) throw new ApiError(400, 'Assign the task to at least one person');
  // Each recipient is gated independently by THEIR task-approval mode: auto → live
  // for them now; manual → their assignment is pending their manager and hidden
  // from them until approved (see listForUser).
  const recips = await prisma.user.findMany({
    where: { id: { in: ids } }, select: { id: true, autoApproveTasks: true, reportsToId: true },
  });
  const rmap = new Map(recips.map((u) => [u.id, u]));
  const links = ids.map((userId) => ({ userId, ...gateFor(assigner.id, rmap.get(userId)) }));

  const t = await prisma.directTask.create({
    data: {
      title: title.trim(), description: (description || '').trim(), assignerId: assigner.id, dueDate: dueDate || null, dueTime: dueTime || null,
      approval: links.some((l) => l.approval === 'pending') ? 'pending' : 'approved',
      assignees: { create: links },
    },
    include,
  });
  const shaped = shape(t);
  notifyAssignments(links, { title: shaped.title, by: shaped.assignerName, dueText: dueDate || null, assignerId: assigner.id });
  return shaped;
}

// Convert an ad-hoc direct task into a project (Event) task: it moves under the
// chosen project and thereafter behaves exactly like any task created there —
// listed with the project, on the calendar, toggleable by its assignee or the
// project owner. The same people keep it with their existing approval/acceptance,
// so nobody is re-assigned or re-notified. Only the task's creator (or an admin)
// may move it, and only into a project they own (or admin) — mirroring the rule
// that only a project's owner may add tasks to it.
export async function attachToProject(actor, id, { eventId, dueOffset = null, dueTime = null } = {}) {
  const t = await prisma.directTask.findUnique({ where: { id }, include: { assignees: true } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.assignerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the person who created this task can move it into a project');
  if (!eventId) throw new ApiError(400, 'Pick a project to add this task to');

  const e = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, ownerId: true, approval: true, status: true, triggerMonth: true, triggerDay: true, tasks: { select: { sort: true } } },
  });
  if (!e) throw new ApiError(404, 'Project not found');
  // Only a live (approved) project may receive the task. A pending project can
  // still be rejected, which hides its tasks everywhere — moving into one and
  // deleting the source direct task would orphan the work permanently.
  if (e.approval !== 'approved') throw new ApiError(400, 'That project is still awaiting approval');
  if (e.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'You can only add tasks to a project you own');

  // A dated project's tasks each carry a due date (offset from the trigger); an
  // undated/TBD project has no anchor, so the task's absolute due is dropped.
  const dated = e.status === 'confirmed' && !!e.triggerMonth;
  let off = null;
  let time = null;
  if (dated) {
    if (dueOffset == null || dueOffset < 0) throw new ApiError(400, 'A due date on or after the project date is required');
    off = dueOffset;
    time = dueTime || null;
  }

  // Carry the assignees over unchanged (same approval + acceptance state) so the
  // people already on it keep it exactly as-is and get no fresh notification.
  const links = t.assignees.map((a) => ({
    userId: a.userId, approval: a.approval, approverId: a.approverId, status: a.status, rejectedReason: a.rejectedReason,
  }));
  const nextSort = e.tasks.reduce((m, x) => Math.max(m, x.sort), -1) + 1;

  // Preserve the done state; recompute "late" against the new project due date.
  let completedLate = false;
  if (t.completed && t.completedAt && dated && off != null) {
    const due = effectiveDue({ dueOffset: off, dueTime: time }, triggerDate({ status: 'confirmed', triggerMonth: e.triggerMonth, triggerDay: e.triggerDay }));
    completedLate = !!due && t.completedAt > due;
  }

  await prisma.$transaction([
    prisma.eventTask.create({
      data: {
        eventId, name: t.title, description: t.description || '', dueOffset: off, dueTime: time, sort: nextSort,
        completed: t.completed, completedAt: t.completedAt, completedLate,
        assignees: { create: links },
      },
    }),
    prisma.directTask.delete({ where: { id } }),
    // If the incoming task is still open, a closed project isn't done anymore —
    // reopen its Project Closure gate. (No-op when the task is already completed.)
    ...(t.completed ? [] : [prisma.eventTask.updateMany({ where: { eventId, isClosure: true, completed: true }, data: { completed: false, completedAt: null } })]),
  ]);
  await logActivity(eventId, actor, `added task “${t.title}” (moved from a direct task)`);
  return { ok: true, eventId };
}

// Tasks assigned TO me — only ones my manager has approved (pending stay hidden).
export async function listForUser(userId) {
  const rows = await prisma.directTask.findMany({
    where: { assignees: { some: { userId, approval: 'approved', status: { not: 'rejected' } } } },
    orderBy: { createdAt: 'desc' }, include,
  });
  return rows.map(shape);
}
// Tasks I assigned (any status) — the assigner sees each recipient's approval state.
export async function listAssignedBy(assignerId) {
  const rows = await prisma.directTask.findMany({ where: { assignerId }, orderBy: { createdAt: 'desc' }, include });
  return rows.map(shape);
}

export async function get(id) {
  const t = await prisma.directTask.findUnique({ where: { id }, include });
  if (!t) throw new ApiError(404, 'Task not found');
  return shape(t);
}

// The RECIPIENT's manager approves/rejects that person's assignment (per recipient).
export async function decideAssignee(actor, taskId, userId, decision) {
  const link = await prisma.directTaskAssignee.findUnique({ where: { taskId_userId: { taskId, userId } } });
  if (!link) throw new ApiError(404, 'That assignment was not found');
  if (link.approval !== 'pending') throw new ApiError(409, 'This assignment is not pending approval');
  if (link.approverId !== actor.id && !canAdmin(actor)) throw new ApiError(403, "Only the recipient's manager can decide this");
  await prisma.directTaskAssignee.update({
    where: { taskId_userId: { taskId, userId } },
    data: { approval: decision === 'approved' ? 'approved' : 'rejected' },
  });
  const shaped = await get(taskId);
  // Approved → the task is now live for that person, so notify them.
  if (decision === 'approved') notifyTaskAssigned(userId, { title: shaped.title, by: shaped.assignerName, dueText: shaped.dueDate });
  return shaped;
}

export async function toggleComplete(actor, id) {
  const t = await prisma.directTask.findUnique({ where: { id }, include: { assignees: true } });
  if (!t) throw new ApiError(404, 'Task not found');
  // A direct task is marked done/undone by the assignee ONLY (not the assigner,
  // not an admin) — the person doing the work owns its status.
  const mine = t.assignees.find((a) => a.userId === actor.id);
  const canByAssignee = mine && mine.approval === 'approved' && mine.status !== 'rejected';
  if (!canByAssignee) {
    throw new ApiError(403, 'Only the assignee can mark this task done or undone');
  }
  const done = !t.completed;
  return shape(await prisma.directTask.update({ where: { id }, data: { completed: done, completedAt: done ? new Date() : null }, include }));
}

// An assignee — or their manager — declines that person's (already-approved) task.
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

// Reassign: the assigner adds one or more new recipients. Each new assignment is
// re-gated by that recipient's own manager (same rule as creation).
export async function addAssignees(actor, taskId, userIds = []) {
  const t = await prisma.directTask.findUnique({ where: { id: taskId }, include: { assignees: true } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.assignerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the assigner can reassign this task');
  const existing = new Set(t.assignees.map((a) => a.userId));
  const ids = [...new Set(userIds)].filter((id) => id && !existing.has(id));
  if (!ids.length) throw new ApiError(400, 'Pick someone new to assign');
  const recips = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, autoApproveTasks: true, reportsToId: true } });
  const rmap = new Map(recips.map((u) => [u.id, u]));
  const links = ids.map((userId) => ({ userId, ...gateFor(actor.id, rmap.get(userId)) }));
  await prisma.directTaskAssignee.createMany({ data: links.map((l) => ({ taskId, ...l })) });
  const shaped = await get(taskId);
  notifyAssignments(links, { title: shaped.title, by: shaped.assignerName, dueText: shaped.dueDate, assignerId: actor.id });
  return shaped;
}

// Reassign: the assigner removes a recipient entirely (drops their assignment).
export async function removeAssignee(actor, taskId, userId) {
  const t = await prisma.directTask.findUnique({ where: { id: taskId } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.assignerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the assigner can reassign this task');
  await prisma.directTaskAssignee.delete({ where: { taskId_userId: { taskId, userId } } }).catch(() => {});
  return get(taskId);
}

// Ad-hoc task assignments awaiting my approval (I'm the recipient's manager) —
// one row per pending recipient.
export async function pendingApprovals(approverId) {
  const links = await prisma.directTaskAssignee.findMany({
    where: { approval: 'pending', approverId },
    include: { user: { select: { id: true, name: true } }, task: { include: { assigner: { select: { name: true } } } } },
    orderBy: { task: { createdAt: 'desc' } },
  });
  return links.map((l) => ({
    taskId: l.taskId, userId: l.userId, userName: l.user?.name,
    title: l.task.title, assignerName: l.task.assigner?.name, dueDate: l.task.dueDate, dueTime: l.task.dueTime,
  }));
}

export async function remove(actor, id) {
  const t = await prisma.directTask.findUnique({ where: { id } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.assignerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the assigner can delete this');
  await prisma.directTask.delete({ where: { id } });
  return { ok: true };
}
