import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

const detailInclude = {
  owner: { select: { id: true, name: true } },
  attendees: { include: { user: { select: { id: true, name: true, departmentId: true } } } },
  actions: { orderBy: { sort: 'asc' } },
};

export async function list(userId, scope) {
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: 'desc' },
    include: { owner: { select: { id: true, name: true } }, _count: { select: { attendees: true } }, attendees: { select: { userId: true } } },
  });
  return meetings
    .filter((m) => scope !== 'mine' || m.ownerId === userId || m.attendees.some((a) => a.userId === userId))
    .map((m) => ({ id: m.id, title: m.title, date: m.date, time: m.time, recurring: m.recurring, mode: m.mode, meetingLink: m.meetingLink, owner: m.owner, attendeeCount: m._count.attendees }));
}

export async function get(id) {
  const m = await prisma.meeting.findUnique({ where: { id }, include: detailInclude });
  if (!m) throw new ApiError(404, 'Meeting not found');
  return {
    ...m,
    attendees: m.attendees.map((a) => ({ id: a.user.id, name: a.user.name, departmentId: a.user.departmentId })),
  };
}

export async function create(ownerId, { title, date, time, recurring, mode, meetingLink, attendeeIds = [], agenda = [] }) {
  if (!title?.trim() || !date) throw new ApiError(400, 'Title and date are required');
  const cleanMode = ['offline', 'online', 'hybrid'].includes(mode) ? mode : 'offline';
  const link = cleanMode === 'offline' ? null : (meetingLink || '').trim() || null;
  const uniqueAttendees = [...new Set([ownerId, ...attendeeIds])];
  const m = await prisma.meeting.create({
    data: {
      title: title.trim(), date, time: time || '10:00', recurring: recurring || 'One-off',
      mode: cleanMode, meetingLink: link,
      ownerId, agenda: agenda.filter((a) => a.trim()),
      attendees: { create: uniqueAttendees.map((userId) => ({ userId })) },
    },
  });
  return get(m.id);
}

export async function updateMinutes(id, minutes) {
  await prisma.meeting.update({ where: { id }, data: { minutes } }).catch(() => { throw new ApiError(404, 'Meeting not found'); });
  return get(id);
}

export function addAction(meetingId, text, ownerId) {
  return prisma.meetingAction.create({ data: { meetingId, text: text.trim(), ownerId: ownerId || null } });
}

export async function toggleAction(actionId) {
  const a = await prisma.meetingAction.findUnique({ where: { id: actionId } });
  if (!a) throw new ApiError(404, 'Action not found');
  return prisma.meetingAction.update({ where: { id: actionId }, data: { done: !a.done } });
}

// Is the user the owner or an attendee? (for edit permission)
export async function isParticipant(meetingId, userId) {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { ownerId: true, attendees: { where: { userId }, select: { userId: true } } } });
  return m && (m.ownerId === userId || m.attendees.length > 0);
}
