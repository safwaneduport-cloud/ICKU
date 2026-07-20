import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';
import { computeState, triggerDate, isTaskPastDue } from './events.lib.js';

// An event's SOP (write-up + PDF/link attachments) lives on the event, but it
// also belongs in the SOP library — so we keep a companion KnowledgeDoc in step
// with it. The event is the source of truth; this doc is its Knowledge Base face
// (searchable, type-filtered, with the existing "Linked event" pill).
const sopAttachments = (list = []) =>
  list.filter((a) => a?.url).map((a) => ({
    kind: a.kind === 'link' ? 'link' : 'pdf',
    label: (a.label || '').trim() || (a.kind === 'link' ? 'SOP link' : 'SOP document'),
    url: a.url,
  }));

async function syncEventSop(eventId) {
  const e = await prisma.event.findUnique({
    where: { id: eventId },
    include: { attachments: true, owner: { select: { id: true, departmentId: true } } },
  });
  if (!e) return;

  const files = e.attachments.filter((a) => a.kind === 'pdf').map((a) => ({ kind: 'pdf', label: a.label, url: a.url }));
  const firstLink = e.attachments.find((a) => a.kind === 'link');
  const hasSop = !!(e.writeup?.trim() || files.length || firstLink);
  const existing = await prisma.knowledgeDoc.findFirst({ where: { eventId, type: 'SOP' } });

  // SOP emptied out → retire the library entry rather than leave a stale one.
  if (!hasSop) {
    if (existing) await prisma.knowledgeDoc.delete({ where: { id: existing.id } });
    return;
  }

  const data = {
    title: `${e.name} — SOP`,
    type: 'SOP',
    body: e.writeup || '',
    link: firstLink?.url || null,
    attachments: files,
    eventId,
    ownerId: e.ownerId || null,
    departmentId: e.owner?.departmentId || null,
  };
  if (existing) await prisma.knowledgeDoc.update({ where: { id: existing.id }, data });
  else await prisma.knowledgeDoc.create({ data });
}

const eventInclude = {
  owner: { select: { id: true, name: true } },
  tasks: {
    orderBy: { sort: 'asc' },
    include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
  },
};

// Shape a raw event row into an API payload (adds computed state + task summary).
function shape(e) {
  const tasks = (e.tasks || []).map((t) => ({
    id: t.id, name: t.name, dueOffset: t.dueOffset, dueTime: t.dueTime, completed: t.completed, completedLate: t.completedLate,
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name, status: a.status, rejectedReason: a.rejectedReason })),
    // A pending deadline-extension request awaiting the owner's decision.
    ext: t.extReqStatus === 'pending' ? { offset: t.extReqOffset, time: t.extReqTime, byId: t.extReqById } : null,
  }));
  const done = tasks.filter((t) => t.completed).length;
  return {
    id: e.id, name: e.name, ownerId: e.ownerId, owner: e.owner,
    status: e.status, triggerMonth: e.triggerMonth, triggerDay: e.triggerDay,
    writeup: e.writeup, approval: e.approval, approverId: e.approverId, createdById: e.createdById,
    state: computeState(e), tasks, tasksDone: done, tasksTotal: tasks.length,
  };
}

export async function list({ filter = 'all', mine = false, userId } = {}) {
  const events = await prisma.event.findMany({ where: { approval: { not: 'rejected' } }, include: eventInclude });
  let shaped = events.map(shape);
  // A pending project is visible only to its creator/owner and the approver —
  // assignees don't see it (or get its tasks) until the manager approves it.
  if (userId) {
    shaped = shaped.filter((e) => e.approval !== 'pending' || e.ownerId === userId || e.approverId === userId);
  }
  if (mine && userId) {
    shaped = shaped.filter(
      (e) => e.ownerId === userId || e.tasks.some((t) => t.assignees.some((a) => a.id === userId))
    );
  }
  if (filter && filter !== 'all') shaped = shaped.filter((e) => e.state === filter);
  // sort: overdue first, then by trigger date
  const order = { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 };
  shaped.sort((a, b) => (order[a.state] - order[b.state]) || a.name.localeCompare(b.name));
  return shaped;
}

export async function get(id) {
  const e = await prisma.event.findUnique({
    where: { id },
    include: {
      ...eventInclude,
      attachments: true,
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
      // Meetings held against this event (tagged from the Meetings module).
      meetings: {
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        select: { id: true, title: true, date: true, time: true, mode: true, minutes: true, minutesFileUrl: true, owner: { select: { name: true } } },
      },
    },
  });
  if (!e) throw new ApiError(404, 'Project not found');
  return { ...shape(e), attachments: e.attachments, comments: e.comments, meetings: e.meetings };
}

export async function create(creator, payload) {
  const { name, status, triggerMonth, triggerDay, writeup, tasks = [], attachments = [] } = payload;
  if (!name?.trim()) throw new ApiError(400, 'Project name is required');

  // Approval routing depends on the creator's mode (set by their manager): auto
  // → goes live immediately; manual → pending their manager's approval, and its
  // tasks stay hidden from assignees until approved (see list()). CEO auto.
  const isCeo = creator.id === 'ceo';
  const u = await prisma.user.findUnique({ where: { id: creator.id }, select: { reportsToId: true, autoApproveProjects: true } });
  const autoApprove = isCeo || u?.autoApproveProjects !== false;
  const approval = autoApprove ? 'approved' : 'pending';
  const approverId = autoApprove ? null : (u?.reportsToId || 'ceo');

  const event = await prisma.event.create({
    data: {
      name: name.trim(),
      ownerId: creator.id,
      status: status || 'confirmed',
      triggerMonth: status === 'confirmed' ? triggerMonth : null,
      triggerDay: status === 'confirmed' ? triggerDay : null,
      writeup: writeup || '',
      approval, approverId, createdById: creator.id,
      attachments: { create: sopAttachments(attachments) },
      tasks: {
        create: tasks.map((t, i) => ({
          name: t.name, dueOffset: t.dueOffset ?? null, dueTime: t.dueTime ?? null, sort: i,
          assignees: { create: (t.assignees || []).map((uid) => ({ userId: uid })) },
        })),
      },
    },
  });
  await syncEventSop(event.id);
  return event;
}

// Edit an event's SOP after the fact — write-up, PDF and link. Owner/creator/admin.
export async function updateSop(actor, id, { writeup, attachments } = {}) {
  const e = await prisma.event.findUnique({ where: { id }, select: { id: true, ownerId: true, createdById: true } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.ownerId !== actor.id && e.createdById !== actor.id && !canAdmin(actor)) {
    throw new ApiError(403, 'Only the project owner (or an admin) can edit its SOP');
  }

  if (writeup !== undefined) {
    await prisma.event.update({ where: { id }, data: { writeup: (writeup || '').trim() } });
  }
  if (Array.isArray(attachments)) {
    // Full replace — the client always sends the complete list.
    await prisma.attachment.deleteMany({ where: { eventId: id } });
    const clean = sopAttachments(attachments);
    if (clean.length) await prisma.attachment.createMany({ data: clean.map((a) => ({ ...a, eventId: id })) });
  }
  await syncEventSop(id);
  return get(id);
}

export async function decide(id, approverId, decision) {
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.approval !== 'pending') throw new ApiError(409, 'Project is not pending approval');
  if (e.approverId !== approverId) throw new ApiError(403, 'Only the assigned approver can decide this');
  return prisma.event.update({ where: { id }, data: { approval: decision } });
}

export async function changeOwner(id, approverId, ownerId) {
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.approverId !== approverId && e.ownerId !== approverId) {
    throw new ApiError(403, 'Only the approver or current owner can reassign');
  }
  return prisma.event.update({ where: { id }, data: { ownerId } });
}

export function approvalsFor(approverId) {
  return prisma.event
    .findMany({ where: { approval: 'pending', approverId }, include: eventInclude })
    .then((rows) => rows.map(shape));
}

// Toggle a task's completion. Allowed for its assignees or the event owner.
export async function toggleTask(taskId, userId) {
  const task = await prisma.eventTask.findUnique({
    where: { id: taskId },
    include: { assignees: true, event: true },
  });
  if (!task) throw new ApiError(404, 'Task not found');
  const isAssignee = task.assignees.some((a) => a.userId === userId);
  const isOwner = task.event.ownerId === userId;
  if (!isAssignee && !isOwner) throw new ApiError(403, 'Only assignees or the project owner can update this task');

  const nowCompleted = !task.completed;
  const trig = triggerDate(task.event);
  const late = nowCompleted && isTaskPastDue(task, trig, new Date());
  return prisma.eventTask.update({
    where: { id: taskId },
    data: { completed: nowCompleted, completedLate: nowCompleted ? late : false },
  });
}

// Is `managerId` the reporting manager of `userId`?
async function isManagerOf(managerId, userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { reportsToId: true } });
  return u?.reportsToId === managerId;
}

// An assignee — or their reporting manager — rejects that person's assignment.
// The task stays for the other assignees; the owner is notified to reassign it.
export async function rejectAssignment(actor, taskId, { forUserId, reason } = {}) {
  const target = forUserId || actor.id;
  const link = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: target } } });
  if (!link) throw new ApiError(404, 'That person is not assigned to this task');
  if (target !== actor.id && !(await isManagerOf(actor.id, target)) && !canAdmin(actor)) {
    throw new ApiError(403, 'Only the assignee or their manager can reject this');
  }
  return prisma.taskAssignee.update({
    where: { taskId_userId: { taskId, userId: target } },
    data: { status: 'rejected', rejectedReason: (reason || '').trim() || null, rejectedAt: new Date() },
  });
}

// An assignee proposes a new deadline (offset from the project trigger + time,
// same shape as dueOffset/dueTime); it waits for the Project Owner's decision.
export async function requestExtension(actor, taskId, { dueOffset, dueTime } = {}) {
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { assignees: true } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (!task.assignees.some((a) => a.userId === actor.id)) throw new ApiError(403, 'Only an assignee can request an extension');
  return prisma.eventTask.update({
    where: { id: taskId },
    data: { extReqOffset: dueOffset ?? null, extReqTime: dueTime ?? null, extReqById: actor.id, extReqStatus: 'pending' },
  });
}

// The Project Owner (or admin) approves/rejects a pending extension. On approve
// the task's due date becomes the proposed one; either way the request clears.
export async function decideExtension(actor, taskId, decision) {
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { event: { select: { ownerId: true } } } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (task.extReqStatus !== 'pending') throw new ApiError(409, 'No pending extension request');
  if (task.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can decide extension requests');
  const clear = { extReqOffset: null, extReqTime: null, extReqById: null, extReqStatus: null };
  const data = decision === 'approved' ? { dueOffset: task.extReqOffset, dueTime: task.extReqTime, ...clear } : clear;
  return prisma.eventTask.update({ where: { id: taskId }, data });
}

// A manager's direct reports + whether each auto-approves the projects they
// create. Drives the toggle UI in My Team (Phase D).
export function reportsApprovalModes(managerId) {
  return prisma.user.findMany({
    where: { reportsToId: managerId },
    select: { id: true, name: true, designation: true, autoApproveProjects: true, autoApproveTasks: true },
    orderBy: { name: 'asc' },
  });
}
// All tasks assigned to one person (for a manager's My Team view). Each carries
// the project it belongs to and who owns it, so the UI can split "assigned by
// me" (owner === viewer) from "assigned by others", and flag overdue ones.
// Pending/rejected projects are excluded — their tasks aren't live yet.
export async function assignedTasksFor(targetUserId) {
  const links = await prisma.taskAssignee.findMany({
    where: { userId: targetUserId },
    include: {
      task: {
        include: {
          event: { select: { id: true, name: true, ownerId: true, approval: true, status: true, triggerMonth: true, triggerDay: true, owner: { select: { name: true } } } },
        },
      },
    },
  });
  const now = new Date();
  return links
    .filter((l) => !['pending', 'rejected'].includes(l.task.event.approval))
    .map(({ task: t, status }) => {
      const e = t.event;
      return {
        taskId: t.id, name: t.name, status,
        projectId: e.id, projectName: e.name, ownerId: e.ownerId, ownerName: e.owner?.name,
        completed: t.completed, overdue: !t.completed && isTaskPastDue(t, triggerDate(e), now),
        dueOffset: t.dueOffset, dueTime: t.dueTime,
        triggerMonth: e.triggerMonth, triggerDay: e.triggerDay, eventStatus: e.status,
      };
    });
}

// Patch either/both auto-approve flags (projects, tasks) for a direct report.
export async function setReportApprovalMode(actor, reportId, patch = {}) {
  const rep = await prisma.user.findUnique({ where: { id: reportId }, select: { reportsToId: true } });
  if (!rep) throw new ApiError(404, 'Employee not found');
  if (rep.reportsToId !== actor.id && !canAdmin(actor)) throw new ApiError(403, "Only this person's manager can change their approval mode");
  const data = {};
  if (typeof patch.autoApproveProjects === 'boolean') data.autoApproveProjects = patch.autoApproveProjects;
  if (typeof patch.autoApproveTasks === 'boolean') data.autoApproveTasks = patch.autoApproveTasks;
  if (!Object.keys(data).length) throw new ApiError(400, 'Nothing to update');
  return prisma.user.update({ where: { id: reportId }, data, select: { id: true, autoApproveProjects: true, autoApproveTasks: true } });
}

export async function addComment(eventId, authorId, body, parentId) {
  if (!body?.trim()) throw new ApiError(400, 'Comment cannot be empty');
  await prisma.event.findUniqueOrThrow({ where: { id: eventId } }).catch(() => { throw new ApiError(404, 'Project not found'); });
  return prisma.eventComment.create({
    data: { eventId, authorId, body: body.trim(), parentId: parentId || null },
    include: { author: { select: { id: true, name: true } } },
  });
}
