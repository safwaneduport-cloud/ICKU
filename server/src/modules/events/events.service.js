import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';
import { gateFor } from '../../lib/taskGate.js';
import { notifyAssignments, notifyApprovalNeeded, notifyTaskAssigned, notifyExtensionRequest } from '../../lib/notify.js';
import { istInstant, istMonthRange } from '../../lib/ist.js';
import { computeState, triggerDate, isTaskPastDue, effectiveDue, isUndated } from './events.lib.js';

// Due instant for an ad-hoc task (dueDate "YYYY-MM-DD" + dueTime "HH:MM", IST).
function directTaskDue(t) {
  if (!t.dueDate) return null;
  const [y, mo, d] = t.dueDate.split('-').map(Number);
  const [h, mi] = (t.dueTime && /^\d{1,2}:\d{2}$/.test(t.dueTime)) ? t.dueTime.split(':').map(Number) : [23, 59];
  return istInstant(y, mo - 1, d, h, mi);
}

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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Human date for a task's offset+time, e.g. "Jul 27, 6:00 PM" (plain calendar
// arithmetic — no timezone nuance since we only need the wall-clock date/time).
function fmtDueText(event, offset, time) {
  if (!event?.triggerMonth || offset == null) return 'no due date';
  const yr = event.triggerMonth >= 4 ? 2026 : 2027; // academic cycle (mirrors triggerDate)
  const d = new Date(yr, event.triggerMonth - 1, (event.triggerDay || 1) + Number(offset));
  let s = `${MON[d.getMonth()]} ${d.getDate()}`;
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    s += `, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return s;
}

// Append one line to a project's activity/edit history (best-effort). Keeps the
// actor's name as a snapshot so the log reads correctly even if they leave.
async function logActivity(eventId, actor, text) {
  let actorName = actor?.name;
  if (!actorName && actor?.id) actorName = (await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name || '';
  await prisma.eventActivity.create({ data: { eventId, actorId: actor?.id || null, actorName: actorName || '', text } }).catch(() => {});
}

// Shape a raw event row into an API payload (adds computed state + task summary).
function shape(e) {
  const tasks = (e.tasks || []).map((t) => ({
    id: t.id, name: t.name, dueOffset: t.dueOffset, dueTime: t.dueTime, completed: t.completed, completedLate: t.completedLate,
    assignees: t.assignees.map((a) => ({
      id: a.user.id, name: a.user.name, status: a.status,
      approval: a.approval, approverId: a.approverId, rejectedReason: a.rejectedReason,
    })),
    // A pending deadline-extension request awaiting the owner's decision.
    ext: t.extReqStatus === 'pending' ? { offset: t.extReqOffset, time: t.extReqTime, byId: t.extReqById } : null,
  }));
  const done = tasks.filter((t) => t.completed).length;
  return {
    id: e.id, name: e.name, description: e.description || '', ownerId: e.ownerId, owner: e.owner,
    status: e.status, triggerMonth: e.triggerMonth, triggerDay: e.triggerDay,
    writeup: e.writeup, approval: e.approval, approverId: e.approverId, createdById: e.createdById,
    pendingOwnerId: e.pendingOwnerId, ownerApproverId: e.ownerApproverId,
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
    // Only tasks whose assignment to me is approved count as "mine".
    shaped = shaped.filter(
      (e) => e.ownerId === userId
        || e.tasks.some((t) => t.assignees.some((a) => a.id === userId && a.approval === 'approved' && a.status !== 'rejected'))
    );
  }
  if (filter && filter !== 'all') shaped = shaped.filter((e) => e.state === filter);
  // sort: overdue first, then by trigger date
  const order = { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 };
  shaped.sort((a, b) => (order[a.state] - order[b.state]) || a.name.localeCompare(b.name));
  return shaped;
}

// Flat list of every task across projects (the "Tasks" view of Projects & Tasks)
// — each row carries its project, owner, due, and a per-task lifecycle state so
// the same All/overdue/current/upcoming/completed filters work. `mine` keeps only
// tasks assigned to me (and approved). Pending projects stay hidden from others.
export async function listTasks({ filter = 'all', mine = false, userId } = {}) {
  const events = await prisma.event.findMany({ where: { approval: { not: 'rejected' } }, include: eventInclude });
  const now = new Date();
  const rows = [];
  for (const e of events) {
    if (e.approval === 'pending' && userId && e.ownerId !== userId && e.approverId !== userId) continue;
    const trig = triggerDate(e);
    for (const t of e.tasks) {
      const overdue = !t.completed && isTaskPastDue(t, trig, now);
      const state = t.completed ? 'completed'
        : overdue ? 'overdue'
        : isUndated(e) ? 'undated'
        : trig && trig <= now ? 'current' : 'upcoming';
      const mineTask = t.assignees.some((a) => a.userId === userId && a.approval === 'approved' && a.status !== 'rejected');
      rows.push({
        taskId: t.id, name: t.name, projectId: e.id, projectName: e.name,
        ownerId: e.ownerId, ownerName: e.owner?.name,
        completed: t.completed, overdue, state,
        dueOffset: t.dueOffset, dueTime: t.dueTime, triggerMonth: e.triggerMonth, triggerDay: e.triggerDay, eventStatus: e.status,
        assignees: t.assignees.filter((a) => a.approval === 'approved' && a.status !== 'rejected').map((a) => ({ id: a.userId, name: a.user.name })),
        mine: mineTask,
      });
    }
  }
  let out = mine && userId ? rows.filter((r) => r.mine) : rows;
  if (filter && filter !== 'all') out = out.filter((r) => r.state === filter);
  const order = { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 };
  return out.sort((a, b) => (order[a.state] - order[b.state]) || a.name.localeCompare(b.name));
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
      activities: { orderBy: { createdAt: 'desc' }, take: 40 },
    },
  });
  if (!e) throw new ApiError(404, 'Project not found');
  return {
    ...shape(e), attachments: e.attachments, comments: e.comments, meetings: e.meetings,
    activity: e.activities.map((a) => ({ id: a.id, actorName: a.actorName, text: a.text, at: a.createdAt })),
  };
}

export async function create(creator, payload) {
  const { name, description = '', status, triggerMonth, triggerDay, writeup, tasks = [], attachments = [] } = payload;
  if (!name?.trim()) throw new ApiError(400, 'Project name is required');

  // A dated project's tasks each need a due date on or after the trigger day.
  const isDated = status === 'confirmed' && !!triggerMonth;
  if (isDated) {
    for (const t of tasks) {
      if (!t.name?.trim()) continue;
      if (t.dueOffset == null || t.dueOffset < 0) throw new ApiError(400, `Task "${t.name.trim()}" needs a due date on or after the project date`);
    }
  }

  // Approval routing depends on the creator's mode (set by their manager): auto
  // → goes live immediately; manual → pending their manager's approval, and its
  // tasks stay hidden from assignees until approved (see list()). CEO auto.
  const isCeo = creator.id === 'ceo';
  const u = await prisma.user.findUnique({ where: { id: creator.id }, select: { name: true, reportsToId: true, autoApproveProjects: true } });
  const autoApprove = isCeo || u?.autoApproveProjects !== false;
  const approval = autoApprove ? 'approved' : 'pending';
  const approverId = autoApprove ? null : (u?.reportsToId || 'ceo');

  // Each task-assignee is also gated per recipient (their autoApproveTasks +
  // their manager) — independent of the project's own approval. Prefetch every
  // recipient once so the nested create can attach each link's approval state.
  const recipientIds = [...new Set(tasks.flatMap((t) => t.assignees || []))];
  const recips = recipientIds.length
    ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, autoApproveTasks: true, reportsToId: true } })
    : [];
  const rmap = new Map(recips.map((r) => [r.id, r]));
  const perTask = tasks.map((t, i) => ({
    name: t.name, dueOffset: t.dueOffset ?? null, dueTime: t.dueTime ?? null, sort: i,
    links: (t.assignees || []).map((uid) => ({ userId: uid, ...gateFor(creator.id, rmap.get(uid)) })),
  }));

  const event = await prisma.event.create({
    data: {
      name: name.trim(),
      description: (description || '').trim(),
      ownerId: creator.id,
      status: status || 'confirmed',
      triggerMonth: status === 'confirmed' ? triggerMonth : null,
      triggerDay: status === 'confirmed' ? triggerDay : null,
      writeup: writeup || '',
      approval, approverId, createdById: creator.id,
      attachments: { create: sopAttachments(attachments) },
      tasks: {
        create: perTask.map((pt) => ({
          name: pt.name, dueOffset: pt.dueOffset, dueTime: pt.dueTime, sort: pt.sort,
          assignees: { create: pt.links },
        })),
      },
    },
  });
  await syncEventSop(event.id);
  // Emails: assignees (or their manager if pending), and the project's approver.
  for (const pt of perTask) notifyAssignments(pt.links, { title: pt.name, project: event.name, by: u?.name, assignerId: creator.id });
  if (approval === 'pending' && approverId) notifyApprovalNeeded(approverId, { kind: 'project', title: name.trim(), by: u?.name });
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

// Delete a project. Only its owner (or a platform admin) may. Tasks, assignees,
// attachments and comments cascade; tagged meetings are un-tagged automatically
// (Meeting.eventId is SetNull). The companion SOP doc and the project chat aren't
// cascade-linked, so we clear them explicitly.
export async function remove(actor, id) {
  const e = await prisma.event.findUnique({ where: { id }, select: { id: true, ownerId: true } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can delete this project');
  await prisma.knowledgeDoc.deleteMany({ where: { eventId: id } });
  await prisma.conversation.deleteMany({ where: { eventId: id } }); // cascades its members + messages
  await prisma.event.delete({ where: { id } }); // cascades tasks, assignees, attachments, comments
  return { ok: true };
}

// Delete a single task from a project. Only the project owner (or admin) may.
// Assignees cascade with the task.
export async function removeTask(actor, taskId) {
  const t = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { event: { select: { id: true, ownerId: true } } } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can delete this task');
  await prisma.eventTask.delete({ where: { id: taskId } });
  return { ok: true };
}

// Transfer project ownership. Only the current owner may initiate it (an admin
// override aside). If the NEW owner's autoApproveProjects is off, the transfer is
// held pending the new owner's manager — the project keeps running under the
// current owner until then. Exception: while a project is still pending its own
// approval, its approver may set the right owner as part of deciding it.
export async function changeOwner(actor, id, newOwnerId) {
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (!newOwnerId) throw new ApiError(400, 'Pick a new owner');
  const admin = canAdmin(actor);

  if (e.approval === 'pending' && e.approverId === actor.id) {
    return prisma.event.update({ where: { id }, data: { ownerId: newOwnerId } });
  }
  if (e.ownerId !== actor.id && !admin) {
    throw new ApiError(403, 'Only the current owner can change the project owner');
  }

  const nu = await prisma.user.findUnique({ where: { id: newOwnerId }, select: { autoApproveProjects: true, reportsToId: true } });
  const managerId = nu?.reportsToId || null;
  const auto = admin || nu?.autoApproveProjects !== false || !managerId || managerId === actor.id;
  if (auto) {
    return prisma.event.update({ where: { id }, data: { ownerId: newOwnerId, pendingOwnerId: null, ownerApproverId: null } });
  }
  // Held for the new owner's manager; ownerId stays put so the project runs on.
  return prisma.event.update({ where: { id }, data: { pendingOwnerId: newOwnerId, ownerApproverId: managerId } });
}

// The new owner's manager approves/rejects a held ownership transfer.
export async function decideOwnerTransfer(actor, id, decision) {
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (!e.pendingOwnerId) throw new ApiError(409, 'No pending ownership transfer');
  if (e.ownerApproverId !== actor.id && !canAdmin(actor)) throw new ApiError(403, "Only the new owner's manager can decide this");
  const data = decision === 'approved'
    ? { ownerId: e.pendingOwnerId, pendingOwnerId: null, ownerApproverId: null }
    : { pendingOwnerId: null, ownerApproverId: null };
  return prisma.event.update({ where: { id }, data });
}

// Ownership transfers awaiting my approval (I'm the proposed new owner's manager).
export async function ownerTransferApprovals(approverId) {
  const rows = await prisma.event.findMany({
    where: { pendingOwnerId: { not: null }, ownerApproverId: approverId },
    include: { owner: { select: { name: true } } },
  });
  const ids = [...new Set(rows.map((r) => r.pendingOwnerId))];
  const news = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nmap = new Map(news.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    eventId: r.id, name: r.name,
    currentOwnerName: r.owner?.name, newOwnerId: r.pendingOwnerId, newOwnerName: nmap.get(r.pendingOwnerId),
  }));
}

export function approvalsFor(approverId) {
  return prisma.event
    .findMany({ where: { approval: 'pending', approverId }, include: eventInclude })
    .then((rows) => rows.map(shape));
}

// Projects this manager has already decided (approved/rejected) — the approval
// history, most recent first.
export function approvalHistory(approverId) {
  return prisma.event
    .findMany({ where: { approverId, approval: { in: ['approved', 'rejected'] } }, orderBy: { updatedAt: 'desc' }, take: 50, include: eventInclude })
    .then((rows) => rows.map((e) => ({ ...shape(e), decidedAt: e.updatedAt })));
}

// Add a task to an existing project (owner/admin). Same due rule as creation;
// the new assignees are gated per recipient like everywhere else.
export async function addTask(actor, eventId, { name, dueOffset = null, dueTime = null, assigneeIds = [] } = {}) {
  const e = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, ownerId: true, status: true, triggerMonth: true, tasks: { select: { sort: true } } },
  });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can add tasks');
  if (!name?.trim()) throw new ApiError(400, 'Task name is required');
  const dated = e.status === 'confirmed' && !!e.triggerMonth;
  if (dated && (dueOffset == null || dueOffset < 0)) throw new ApiError(400, 'A due date on or after the project date is required');

  const ids = [...new Set(assigneeIds)];
  const recips = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, autoApproveTasks: true, reportsToId: true } }) : [];
  const rmap = new Map(recips.map((u) => [u.id, u]));
  const links = ids.map((uid) => ({ userId: uid, ...gateFor(actor.id, rmap.get(uid)) }));
  const nextSort = e.tasks.reduce((m, t) => Math.max(m, t.sort), -1) + 1;
  await prisma.eventTask.create({
    data: {
      eventId, name: name.trim(), dueOffset: dated ? dueOffset : null, dueTime: dated ? dueTime : null, sort: nextSort,
      assignees: { create: links },
    },
  });
  notifyAssignments(links, { title: name.trim(), project: e.name, assignerId: actor.id });
  return get(eventId);
}

// Toggle a task's completion. Allowed for its assignees or the event owner.
export async function toggleTask(taskId, userId) {
  const task = await prisma.eventTask.findUnique({
    where: { id: taskId },
    include: { assignees: true, event: true },
  });
  if (!task) throw new ApiError(404, 'Task not found');
  const isAssignee = task.assignees.some((a) => a.userId === userId && a.approval === 'approved');
  const isOwner = task.event.ownerId === userId;
  if (!isAssignee && !isOwner) throw new ApiError(403, 'Only assignees or the project owner can update this task');

  const nowCompleted = !task.completed;
  const trig = triggerDate(task.event);
  const late = nowCompleted && isTaskPastDue(task, trig, new Date());
  return prisma.eventTask.update({
    where: { id: taskId },
    data: { completed: nowCompleted, completedLate: nowCompleted ? late : false, completedAt: nowCompleted ? new Date() : null },
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
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { assignees: true, event: { select: { name: true, ownerId: true, triggerMonth: true, triggerDay: true, status: true } } } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (!task.assignees.some((a) => a.userId === actor.id)) throw new ApiError(403, 'Only an assignee can request an extension');
  const updated = await prisma.eventTask.update({
    where: { id: taskId },
    data: { extReqOffset: dueOffset ?? null, extReqTime: dueTime ?? null, extReqById: actor.id, extReqStatus: 'pending' },
  });
  // Surface to the owner: the Approvals page picks it up, and we email them too.
  const by = (await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name;
  notifyExtensionRequest(task.event.ownerId, { task: task.name, project: task.event.name, by, newDate: fmtDueText(task.event, dueOffset, dueTime) });
  return updated;
}

// The Project Owner (or admin) approves/rejects a pending extension. On approve
// the task's due date becomes the proposed one; either way the request clears.
export async function decideExtension(actor, taskId, decision) {
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { event: { select: { id: true, ownerId: true, triggerMonth: true, triggerDay: true, status: true } } } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (task.extReqStatus !== 'pending') throw new ApiError(409, 'No pending extension request');
  if (task.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can decide extension requests');
  const clear = { extReqOffset: null, extReqTime: null, extReqById: null, extReqStatus: null };
  const data = decision === 'approved' ? { dueOffset: task.extReqOffset, dueTime: task.extReqTime, ...clear } : clear;
  const updated = await prisma.eventTask.update({ where: { id: taskId }, data });
  if (decision === 'approved') await logActivity(task.eventId, actor, `extended “${task.name}” to ${fmtDueText(task.event, task.extReqOffset, task.extReqTime)}`);
  return updated;
}

// Pending extension requests on tasks in projects I own (Approvals queue).
export async function extensionApprovals(ownerId) {
  const tasks = await prisma.eventTask.findMany({
    where: { extReqStatus: 'pending', event: { ownerId } },
    include: {
      event: { select: { id: true, name: true, triggerMonth: true, triggerDay: true, status: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  return tasks.map((t) => ({
    taskId: t.id, taskName: t.name, projectId: t.eventId, projectName: t.event.name,
    currentDue: fmtDueText(t.event, t.dueOffset, t.dueTime),
    requestedDue: fmtDueText(t.event, t.extReqOffset, t.extReqTime),
    requestedBy: t.assignees.find((a) => a.userId === t.extReqById)?.user.name || 'an assignee',
  }));
}

// Edit a project (owner/admin): name, description, status, trigger date. Logs
// each meaningful change to the activity history.
export async function update(actor, id, patch = {}) {
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) throw new ApiError(404, 'Project not found');
  if (e.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can edit this project');
  const data = {};
  const logs = [];
  if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== e.name) {
    data.name = patch.name.trim();
    logs.push(`renamed the project to “${data.name}”`);
  }
  if (patch.description !== undefined && (patch.description || '').trim() !== (e.description || '')) {
    data.description = (patch.description || '').trim();
    logs.push('edited the description');
  }
  if (patch.status !== undefined && patch.status !== e.status) {
    data.status = patch.status;
    if (patch.status !== 'confirmed') { data.triggerMonth = null; data.triggerDay = null; }
    logs.push(patch.status === 'confirmed' ? 'set a fixed date' : 'set the date to TBD');
  }
  const statusNow = data.status ?? e.status;
  if (statusNow === 'confirmed' && (patch.triggerMonth !== undefined || patch.triggerDay !== undefined)) {
    const m = patch.triggerMonth ?? e.triggerMonth;
    const d = Math.min(31, Math.max(1, patch.triggerDay ?? e.triggerDay ?? 1));
    if (m !== e.triggerMonth || d !== e.triggerDay) {
      data.triggerMonth = m; data.triggerDay = d;
      logs.push(`changed the trigger date to ${MON[(m || 1) - 1]} ${d}`);
    }
  }
  if (Object.keys(data).length) {
    await prisma.event.update({ where: { id }, data });
    for (const t of logs) await logActivity(id, actor, t);
  }
  return get(id);
}

// Edit a project task (owner/admin): name and/or due date. Logs the change.
export async function updateTask(actor, taskId, patch = {}) {
  const t = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { event: { select: { id: true, ownerId: true, status: true, triggerMonth: true, triggerDay: true } } } });
  if (!t) throw new ApiError(404, 'Task not found');
  if (t.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can edit tasks');
  const data = {};
  const logs = [];
  const newName = patch.name !== undefined ? patch.name.trim() : t.name;
  if (patch.name !== undefined && newName && newName !== t.name) {
    data.name = newName;
    logs.push(`renamed task “${t.name}” to “${newName}”`);
  }
  const dated = t.event.status === 'confirmed' && !!t.event.triggerMonth;
  if (dated && (patch.dueOffset !== undefined || patch.dueTime !== undefined)) {
    const off = patch.dueOffset !== undefined ? patch.dueOffset : t.dueOffset;
    const tm = patch.dueTime !== undefined ? patch.dueTime : t.dueTime;
    if (off != null && off < 0) throw new ApiError(400, 'Due date can’t be before the project date');
    if (off !== t.dueOffset || tm !== t.dueTime) {
      data.dueOffset = off; data.dueTime = tm;
      logs.push(`changed “${newName}” due date to ${fmtDueText(t.event, off, tm)}`);
    }
  }
  if (Object.keys(data).length) {
    await prisma.eventTask.update({ where: { id: taskId }, data });
    for (const l of logs) await logActivity(t.eventId, actor, l);
  }
  return get(t.eventId);
}

// Reassign a project task: the project owner adds new recipients. Each new
// assignment is re-gated by that recipient's own manager (same rule as creation).
export async function addTaskAssignees(actor, taskId, userIds = []) {
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { assignees: true, event: { select: { id: true, name: true, ownerId: true } } } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (task.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can reassign tasks');
  const existing = new Set(task.assignees.map((a) => a.userId));
  const ids = [...new Set(userIds)].filter((id) => id && !existing.has(id));
  if (!ids.length) throw new ApiError(400, 'Pick someone new to assign');
  const recips = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, autoApproveTasks: true, reportsToId: true } });
  const rmap = new Map(recips.map((u) => [u.id, u]));
  const links = ids.map((userId) => ({ userId, ...gateFor(actor.id, rmap.get(userId)) }));
  await prisma.taskAssignee.createMany({ data: links.map((l) => ({ taskId, ...l })) });
  notifyAssignments(links, { title: task.name, project: task.event.name, assignerId: actor.id });
  return get(task.event.id);
}

// Reassign a project task: the project owner drops a recipient's assignment.
export async function removeTaskAssignee(actor, taskId, userId) {
  const task = await prisma.eventTask.findUnique({ where: { id: taskId }, include: { event: { select: { id: true, ownerId: true } } } });
  if (!task) throw new ApiError(404, 'Task not found');
  if (task.event.ownerId !== actor.id && !canAdmin(actor)) throw new ApiError(403, 'Only the project owner can reassign tasks');
  await prisma.taskAssignee.delete({ where: { taskId_userId: { taskId, userId } } }).catch(() => {});
  return get(task.event.id);
}

// Project-task assignments awaiting my approval (I'm the recipient's manager) —
// one row per pending recipient, same shape idea as the ad-hoc task queue.
export async function taskAssigneeApprovals(approverId) {
  const links = await prisma.taskAssignee.findMany({
    where: { approval: 'pending', approverId },
    include: {
      user: { select: { id: true, name: true } },
      task: { include: { event: { select: { id: true, name: true, owner: { select: { name: true } } } } } },
    },
  });
  return links.map((l) => ({
    taskId: l.taskId, userId: l.userId, userName: l.user?.name,
    taskName: l.task.name, projectId: l.task.event.id, projectName: l.task.event.name, assignerName: l.task.event.owner?.name,
  }));
}

// The recipient's manager approves/rejects that person's project-task assignment.
export async function decideTaskAssignee(actor, taskId, userId, decision) {
  const link = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId } } });
  if (!link) throw new ApiError(404, 'That assignment was not found');
  if (link.approval !== 'pending') throw new ApiError(409, 'This assignment is not pending approval');
  if (link.approverId !== actor.id && !canAdmin(actor)) throw new ApiError(403, "Only the recipient's manager can decide this");
  const updated = await prisma.taskAssignee.update({
    where: { taskId_userId: { taskId, userId } },
    data: { approval: decision === 'approved' ? 'approved' : 'rejected' },
  });
  if (decision === 'approved') {
    const t = await prisma.eventTask.findUnique({ where: { id: taskId }, select: { name: true, event: { select: { name: true } } } });
    notifyTaskAssigned(userId, { title: t?.name, project: t?.event?.name });
  }
  return updated;
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
    .map(({ task: t, status, approval }) => {
      const e = t.event;
      return {
        taskId: t.id, name: t.name, status, approval,
        projectId: e.id, projectName: e.name, ownerId: e.ownerId, ownerName: e.owner?.name,
        // A task whose assignment is still pending the recipient's manager isn't
        // "live" yet, so it can't be overdue.
        completed: t.completed, overdue: approval === 'approved' && !t.completed && isTaskPastDue(t, triggerDate(e), now),
        dueOffset: t.dueOffset, dueTime: t.dueTime,
        triggerMonth: e.triggerMonth, triggerDay: e.triggerDay, eventStatus: e.status,
      };
    });
}

// Task delay stats for one IST calendar month — completed tasks (project +
// ad-hoc) assigned to the user, with a `late` flag = finished after due. Powers
// the Tasks Delayed + On-time cards and their detail.
export async function taskMonthStats(userId, year, month) {
  const { start, end } = istMonthRange(year, month);
  const [proj, direct] = await Promise.all([
    prisma.taskAssignee.findMany({
      where: { userId, approval: 'approved', status: { not: 'rejected' }, task: { completed: true, completedAt: { gte: start, lt: end } } },
      include: { task: { include: { event: { select: { name: true, status: true, triggerMonth: true, triggerDay: true } } } } },
    }),
    prisma.directTaskAssignee.findMany({
      where: { userId, approval: 'approved', status: { not: 'rejected' }, task: { completed: true, completedAt: { gte: start, lt: end } } },
      include: { task: true },
    }),
  ]);
  const completions = [
    ...proj.map(({ task: t }) => ({ name: t.name, project: t.event?.name, source: 'project', completedAt: t.completedAt, dueAt: effectiveDue(t, triggerDate(t.event)), late: !!t.completedLate })),
    ...direct.map(({ task: t }) => {
      const due = directTaskDue(t);
      return { name: t.title, project: null, source: 'task', completedAt: t.completedAt, dueAt: due, late: !!(due && t.completedAt && t.completedAt > due) };
    }),
  ].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const delayed = completions.filter((c) => c.late).length;
  const total = completions.length;
  return { year, month, total, delayed, onTimePct: total ? Math.round(((total - delayed) / total) * 100) : 100, habitual: delayed >= 3, completions };
}

// Currently-pending tasks (project + ad-hoc) assigned to the user, overdue first.
export async function taskPending(userId) {
  const now = new Date();
  const [proj, direct] = await Promise.all([
    prisma.taskAssignee.findMany({
      where: { userId, approval: 'approved', status: { not: 'rejected' }, task: { completed: false } },
      include: { task: { include: { event: { select: { name: true, approval: true, status: true, triggerMonth: true, triggerDay: true } } } } },
    }),
    prisma.directTaskAssignee.findMany({
      where: { userId, approval: 'approved', status: { not: 'rejected' }, task: { completed: false } },
      include: { task: true },
    }),
  ]);
  const out = [];
  for (const { task: t } of proj) {
    if (['pending', 'rejected'].includes(t.event?.approval)) continue; // project not live yet
    const due = effectiveDue(t, triggerDate(t.event));
    out.push({ name: t.name, project: t.event?.name, source: 'project', dueAt: due, overdue: !!(due && now > due) });
  }
  for (const { task: t } of direct) {
    const due = directTaskDue(t);
    out.push({ name: t.title, project: null, source: 'task', dueAt: due, overdue: !!(due && now > due) });
  }
  return out.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
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
