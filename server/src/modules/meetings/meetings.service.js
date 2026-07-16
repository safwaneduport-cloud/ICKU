import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { createTeamsEvent, updateTeamsEvent, deleteTeamsEvent } from '../integrations/microsoft.service.js';
import { canAdmin } from '../../lib/access.js';

// Build the IST wall-clock start/end for a Teams event. UTC math is used purely
// for arithmetic (IST has no DST); the timeZone is sent to Graph separately.
function istWindow(date, time, durationMin = 60) {
  const [h, m] = (time || '10:00').split(':').map((n) => parseInt(n, 10) || 0);
  const start = new Date(Date.UTC(...date.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)), h, m));
  const end = new Date(start.getTime() + durationMin * 60000);
  const fmt = (d) => d.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
  return { startDateTime: fmt(start), endDateTime: fmt(end) };
}

// Map an ICKU meeting → a Microsoft Graph recurrence (or null for one-off). The
// range honours the "ends" choice: never (noEnd) / until a date / after N times.
function graphRecurrence(m) {
  if (!m.recurring || m.recurring === 'One-off') return null;
  const d = new Date(`${m.date}T00:00:00Z`);
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()];
  let pattern;
  if (m.recurring === 'Daily') pattern = { type: 'daily', interval: 1 };
  else if (m.recurring === 'Weekly') pattern = { type: 'weekly', interval: 1, daysOfWeek: [dow] };
  else if (m.recurring === 'Monthly') pattern = { type: 'absoluteMonthly', interval: 1, dayOfMonth: d.getUTCDate() };
  else return null;

  let range;
  if (m.recurEnd === 'until' && m.recurUntil) range = { type: 'endDate', startDate: m.date, endDate: m.recurUntil };
  else if (m.recurEnd === 'count' && m.recurCount) range = { type: 'numbered', startDate: m.date, numberOfOccurrences: m.recurCount };
  else range = { type: 'noEnd', startDate: m.date };
  return { pattern, range };
}

// Build the Graph event body for a meeting (attendee emails resolved here).
async function teamsPayload(m, ownerId) {
  const invitees = await prisma.user.findMany({
    where: { id: { in: (m.attendeeIds || []).filter((id) => id !== ownerId) } },
    select: { name: true, email: true },
  });
  const { startDateTime, endDateTime } = istWindow(m.date, m.time, m.durationMin);
  return {
    subject: m.title,
    startDateTime, endDateTime,
    recurrence: graphRecurrence(m),
    attendees: invitees.map((u) => ({ email: u.email, name: u.name })),
    bodyText: (m.agenda || []).length ? `Agenda:\n- ${m.agenda.join('\n- ')}` : '',
  };
}

const cleanRecurring = (r) => (['One-off', 'Daily', 'Weekly', 'Monthly'].includes(r) ? r : 'One-off');
const cleanDur = (d) => Math.min(480, Math.max(15, parseInt(d, 10) || 60));
function recurEndFields({ recurring, recurEnd, recurUntil, recurCount }) {
  if (cleanRecurring(recurring) === 'One-off') return { recurEnd: 'never', recurUntil: null, recurCount: null };
  if (recurEnd === 'until' && recurUntil) return { recurEnd: 'until', recurUntil, recurCount: null };
  if (recurEnd === 'count') return { recurEnd: 'count', recurUntil: null, recurCount: Math.min(365, Math.max(1, parseInt(recurCount, 10) || 1)) };
  return { recurEnd: 'never', recurUntil: null, recurCount: null };
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
    .map((m) => ({ id: m.id, title: m.title, date: m.date, time: m.time, durationMin: m.durationMin, recurring: m.recurring, mode: m.mode, meetingLink: m.meetingLink, owner: m.owner, attendeeCount: m._count.attendees }));
}

export async function get(id) {
  const m = await prisma.meeting.findUnique({ where: { id }, include: detailInclude });
  if (!m) throw new ApiError(404, 'Meeting not found');
  return {
    ...m,
    attendees: m.attendees.map((a) => ({ id: a.user.id, name: a.user.name, departmentId: a.user.departmentId })),
  };
}

export async function create(ownerId, body) {
  const { title, date, time, mode, meetingLink, attendeeIds = [], agenda = [] } = body;
  if (!title?.trim() || !date) throw new ApiError(400, 'Title and date are required');
  const cleanMode = ['offline', 'online', 'hybrid'].includes(mode) ? mode : 'offline';
  const manualLink = (meetingLink || '').trim() || null;
  const uniqueAttendees = [...new Set([ownerId, ...attendeeIds])];
  const cleanAgenda = agenda.filter((a) => a.trim());
  const rec = recurEndFields(body);

  const m = await prisma.meeting.create({
    data: {
      title: title.trim(), date, time: time || '10:00', recurring: cleanRecurring(body.recurring), durationMin: cleanDur(body.durationMin),
      ...rec, mode: cleanMode, meetingLink: cleanMode === 'offline' ? null : manualLink,
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
      const full = await prisma.meeting.findUnique({ where: { id: m.id } });
      const teams = await createTeamsEvent(ownerId, await teamsPayload({ ...full, attendeeIds: uniqueAttendees }, ownerId));
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

const canManage = (meeting, user) => meeting.ownerId === user.id || canAdmin(user);

// Edit a meeting's details and propagate to its Teams event (patch / create /
// delete as the mode changes). Owner or admin only.
export async function update(user, id, body) {
  const existing = await prisma.meeting.findUnique({ where: { id }, include: { attendees: { select: { userId: true } } } });
  if (!existing) throw new ApiError(404, 'Meeting not found');
  if (!canManage(existing, user)) throw new ApiError(403, 'Only the chair (or an admin) can edit this meeting');

  const cleanMode = ['offline', 'online', 'hybrid'].includes(body.mode) ? body.mode : existing.mode;
  const manualLink = (body.meetingLink || '').trim() || null;
  const attendeeIds = [...new Set([existing.ownerId, ...(body.attendeeIds || existing.attendees.map((a) => a.userId))])];
  const rec = recurEndFields({ recurring: body.recurring ?? existing.recurring, recurEnd: body.recurEnd, recurUntil: body.recurUntil, recurCount: body.recurCount });

  // Replace attendee set.
  await prisma.meetingAttendee.deleteMany({ where: { meetingId: id } });
  await prisma.meeting.update({
    where: { id },
    data: {
      title: (body.title ?? existing.title).trim() || existing.title,
      date: body.date ?? existing.date,
      time: body.time ?? existing.time,
      durationMin: cleanDur(body.durationMin ?? existing.durationMin),
      recurring: cleanRecurring(body.recurring ?? existing.recurring),
      ...rec,
      mode: cleanMode,
      meetingLink: cleanMode === 'offline' ? null : manualLink,
      agenda: Array.isArray(body.agenda) ? body.agenda.filter((a) => a.trim()) : existing.agenda,
      attendees: { create: attendeeIds.map((userId) => ({ userId })) },
    },
  });

  const m = await prisma.meeting.findUnique({ where: { id } });
  let teamsWarning = null;
  try {
    if (cleanMode === 'offline' || manualLink) {
      // No auto-Teams needed now — cancel any event we'd created.
      if (existing.msEventId) { await deleteTeamsEvent(existing.ownerId, existing.msEventId); await prisma.meeting.update({ where: { id }, data: { msEventId: null } }); }
    } else {
      const payload = await teamsPayload({ ...m, attendeeIds }, existing.ownerId);
      if (existing.msEventId) {
        const t = await updateTeamsEvent(existing.ownerId, existing.msEventId, payload);
        if (t?.joinUrl) await prisma.meeting.update({ where: { id }, data: { meetingLink: t.joinUrl } });
      } else {
        const t = await createTeamsEvent(existing.ownerId, payload);
        if (t?.joinUrl) await prisma.meeting.update({ where: { id }, data: { meetingLink: t.joinUrl, msEventId: t.id } });
        else teamsWarning = 'Connect Microsoft in Profile to auto-create a Teams link.';
      }
    }
  } catch (e) {
    teamsWarning = e.message || 'Could not update the Teams meeting.';
  }

  const shaped = await get(id);
  return teamsWarning ? { ...shaped, teamsWarning } : shaped;
}

// Cancel a meeting — deletes the Teams event (sending cancellations) then the
// ICKU meeting. Owner or admin only.
export async function remove(user, id) {
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (!canManage(m, user)) throw new ApiError(403, 'Only the chair (or an admin) can cancel this meeting');
  if (m.msEventId) await deleteTeamsEvent(m.ownerId, m.msEventId);
  await prisma.meeting.delete({ where: { id } });
  return { ok: true };
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
