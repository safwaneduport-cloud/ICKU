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
    assignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
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
  if (!name?.trim()) throw new ApiError(400, 'Event name is required');

  // Approval routing: CEO auto-approves; everyone else routes to their manager.
  // The JWT only carries id/role/tier, so look up the reporting manager here.
  const isCeo = creator.id === 'ceo';
  const approval = isCeo ? 'approved' : 'pending';
  let approverId = null;
  if (!isCeo) {
    const u = await prisma.user.findUnique({ where: { id: creator.id }, select: { reportsToId: true } });
    approverId = u?.reportsToId || 'ceo';
  }

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

export async function addComment(eventId, authorId, body, parentId) {
  if (!body?.trim()) throw new ApiError(400, 'Comment cannot be empty');
  await prisma.event.findUniqueOrThrow({ where: { id: eventId } }).catch(() => { throw new ApiError(404, 'Project not found'); });
  return prisma.eventComment.create({
    data: { eventId, authorId, body: body.trim(), parentId: parentId || null },
    include: { author: { select: { id: true, name: true } } },
  });
}
