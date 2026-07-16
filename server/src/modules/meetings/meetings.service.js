import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { createTeamsEvent, deleteTeamsEvent } from '../integrations/microsoft.service.js';

// Build the IST wall-clock start/end for a Teams event. UTC math is used purely
// for arithmetic (IST has no DST); the timeZone is sent to Graph separately.
function istWindow(date, time, durationMin = 60) {
  const [h, m] = (time || '10:00').split(':').map((n) => parseInt(n, 10) || 0);
  const start = new Date(Date.UTC(...date.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)), h, m));
  const end = new Date(start.getTime() + durationMin * 60000);
  const fmt = (d) => d.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
  return { startDateTime: fmt(start), endDateTime: fmt(end) };
}

// Map ICKU's recurring value → a Microsoft Graph recurrence (or null for one-off).
// Range is open-ended ("noEnd") — the same as an ongoing standing meeting.
function graphRecurrence(recurring, date) {
  if (!recurring || recurring === 'One-off') return null;
  const d = new Date(`${date}T00:00:00Z`);
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()];
  let pattern;
  if (recurring === 'Daily') pattern = { type: 'daily', interval: 1 };
  else if (recurring === 'Weekly') pattern = { type: 'weekly', interval: 1, daysOfWeek: [dow] };
  else if (recurring === 'Monthly') pattern = { type: 'absoluteMonthly', interval: 1, dayOfMonth: d.getUTCDate() };
  else return null;
  return { pattern, range: { type: 'noEnd', startDate: date } };
}

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

export async function create(ownerId, { title, date, time, recurring, durationMin, mode, meetingLink, attendeeIds = [], agenda = [] }) {
  if (!title?.trim() || !date) throw new ApiError(400, 'Title and date are required');
  const cleanMode = ['offline', 'online', 'hybrid'].includes(mode) ? mode : 'offline';
  const manualLink = (meetingLink || '').trim() || null;
  const uniqueAttendees = [...new Set([ownerId, ...attendeeIds])];
  const cleanAgenda = agenda.filter((a) => a.trim());
  const dur = Math.min(480, Math.max(15, parseInt(durationMin, 10) || 60));
  const cleanRecurring = ['One-off', 'Daily', 'Weekly', 'Monthly'].includes(recurring) ? recurring : 'One-off';

  const m = await prisma.meeting.create({
    data: {
      title: title.trim(), date, time: time || '10:00', recurring: cleanRecurring, durationMin: dur,
      mode: cleanMode, meetingLink: cleanMode === 'offline' ? null : manualLink,
      ownerId, agenda: cleanAgenda,
      attendees: { create: uniqueAttendees.map((userId) => ({ userId })) },
    },
  });

  // Online/hybrid with no manually-pasted link → try to make a real Teams meeting
  // on the owner's Outlook (and invite attendees). Non-fatal: the ICKU meeting
  // stands even if the owner isn't connected or Graph errors — we just flag it.
  let teamsWarning = null;
  if (cleanMode !== 'offline' && !manualLink) {
    try {
      const invitees = await prisma.user.findMany({
        where: { id: { in: uniqueAttendees.filter((id) => id !== ownerId) } },
        select: { name: true, email: true },
      });
      const { startDateTime, endDateTime } = istWindow(date, time, dur);
      const teams = await createTeamsEvent(ownerId, {
        subject: title.trim(),
        startDateTime, endDateTime,
        recurrence: graphRecurrence(cleanRecurring, date),
        attendees: invitees.map((u) => ({ email: u.email, name: u.name })),
        bodyText: cleanAgenda.length ? `Agenda:\n- ${cleanAgenda.join('\n- ')}` : '',
      });
      if (teams?.joinUrl) {
        await prisma.meeting.update({ where: { id: m.id }, data: { meetingLink: teams.joinUrl, msEventId: teams.id } });
      } else {
        teamsWarning = 'Connect your Microsoft account in Profile to auto-create a Teams link.';
      }
    } catch (e) {
      teamsWarning = e.message || 'Could not create the Teams meeting automatically.';
    }
  }

  const shaped = await get(m.id);
  return teamsWarning ? { ...shaped, teamsWarning } : shaped;
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
