import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { createTeamsEvent, updateTeamsEvent, deleteTeamsEvent } from '../integrations/microsoft.service.js';
import { canAdmin } from '../../lib/access.js';
import { sendMeetingInvites } from './invites.js';
import { deliveryAddressFor, MAIL_FIELDS } from '../../lib/mail-address.js';

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

// The bookable rooms. `Others` lets people name a room we don't list.
export const ROOMS = [
  { id: 'Prana', hint: 'Deep Work Room · 1–2 people' },
  { id: 'Collab', hint: 'Brainstorming, quick syncs · 2–3 people' },
  { id: 'Synergy', hint: 'Strategy & planning · 3+ people, cross-functional' },
  { id: 'Others', hint: 'Any other room' },
];
const ROOM_IDS = ROOMS.map((r) => r.id);
export const roomLabel = (m) => (!m.room ? null : m.room === 'Others' ? (m.roomOther || 'Other room') : m.room);

// Build the Graph event body for a meeting, WITH its attendees — so Exchange
// sends the invitations natively. That's reliable for both internal Outlook/Teams
// mailboxes and external Gmail (iMIP), which a fabricated .ics is not. Each
// attendee is invited at their real delivery address (eduport, else google).
// ICKU only sends its own .ics when NO Teams event exists (see create/update).
async function teamsPayload(m) {
  const invitees = await prisma.user.findMany({
    where: { id: { in: (m.attendeeIds || []).filter((id) => id !== m.ownerId) } },
    select: MAIL_FIELDS,
  });
  const { startDateTime, endDateTime } = istWindow(m.date, m.time, m.durationMin);
  return {
    subject: m.title,
    startDateTime, endDateTime,
    recurrence: graphRecurrence(m),
    location: roomLabel(m),
    attendees: invitees
      .map((u) => ({ email: deliveryAddressFor(u), name: u.name }))
      .filter((a) => a.email),
    bodyText: (m.agenda || []).length ? `Agenda:\n- ${m.agenda.join('\n- ')}` : '',
  };
}

// Room only applies to offline/hybrid; a tagged event must exist.
function roomFields(mode, { room, roomOther }) {
  if (mode === 'online' || !ROOM_IDS.includes(room)) return { room: null, roomOther: null };
  return { room, roomOther: room === 'Others' ? (roomOther || '').trim() || null : null };
}
async function cleanEventId(eventId) {
  if (!eventId) return null;
  const e = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!e) throw new ApiError(400, 'That project no longer exists');
  return e.id;
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
  event: { select: { id: true, name: true } }, // tagged institutional event
};

export async function list(userId, scope) {
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: 'desc' },
    include: { owner: { select: { id: true, name: true } }, _count: { select: { attendees: true } }, attendees: { select: { userId: true } } },
  });
  return meetings
    .filter((m) => scope !== 'mine' || m.ownerId === userId || m.attendees.some((a) => a.userId === userId))
    // msEventId lets the calendar view drop the Outlook mirror of a meeting ICKU
    // itself created in Teams, so it isn't shown twice.
    .map((m) => ({ id: m.id, title: m.title, date: m.date, time: m.time, durationMin: m.durationMin, recurring: m.recurring, mode: m.mode, meetingLink: m.meetingLink, msEventId: m.msEventId, owner: m.owner, attendeeCount: m._count.attendees,
      // Does the signed-in user own or attend this? Drives week-view conflict flags.
      mine: m.ownerId === userId || m.attendees.some((a) => a.userId === userId) }));
}

export async function get(id) {
  const m = await prisma.meeting.findUnique({ where: { id }, include: detailInclude });
  if (!m) throw new ApiError(404, 'Meeting not found');
  return {
    ...m,
    roomLabel: roomLabel(m),
    started: hasStarted(m),
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
      ...roomFields(cleanMode, body),
      eventId: await cleanEventId(body.eventId),
      ownerId, agenda: cleanAgenda,
      attendees: { create: uniqueAttendees.map((userId) => ({ userId })) },
    },
  });

  // Online/hybrid with no manually-pasted link → make a real Teams meeting on the
  // owner's Outlook WITH the attendees, so Exchange sends the invites. Non-fatal:
  // the ICKU meeting stands even if the owner isn't connected or Graph errors.
  let teamsWarning = null;
  let teamsCreated = false;
  if (cleanMode !== 'offline' && !manualLink) {
    try {
      const full = await prisma.meeting.findUnique({ where: { id: m.id } });
      const teams = await createTeamsEvent(ownerId, await teamsPayload({ ...full, attendeeIds: uniqueAttendees }));
      if (teams?.joinUrl) {
        await prisma.meeting.update({ where: { id: m.id }, data: { meetingLink: teams.joinUrl, msEventId: teams.id } });
        teamsCreated = true;
      } else {
        teamsWarning = 'Connect your Microsoft account in Profile to auto-create a Teams link.';
      }
    } catch (e) {
      teamsWarning = e.message || 'Could not create the Teams meeting automatically.';
    }
  }

  // If a Teams event was created, Exchange already invited the attendees — don't
  // also send an ICKU .ics (that would double-invite). Only ICKU-invite when
  // there's no Teams event: offline meetings, pasted links, or an unconnected owner.
  const invited = teamsCreated
    ? { sent: uniqueAttendees.filter((id) => id !== ownerId).length, via: 'outlook' }
    : await sendMeetingInvites(m.id).catch((e) => { console.error('[invites] create', e.message); return null; });

  const shaped = await get(m.id);
  return { ...shaped, ...(teamsWarning ? { teamsWarning } : {}), ...(invited ? { invited } : {}) };
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

  // Replace attendee set. Bump the invite SEQUENCE so calendars accept the edit.
  await prisma.meetingAttendee.deleteMany({ where: { meetingId: id } });
  await prisma.meeting.update({
    where: { id },
    data: {
      inviteSeq: { increment: 1 },
      title: (body.title ?? existing.title).trim() || existing.title,
      date: body.date ?? existing.date,
      time: body.time ?? existing.time,
      durationMin: cleanDur(body.durationMin ?? existing.durationMin),
      recurring: cleanRecurring(body.recurring ?? existing.recurring),
      ...rec,
      mode: cleanMode,
      meetingLink: cleanMode === 'offline' ? null : manualLink,
      ...roomFields(cleanMode, { room: body.room ?? existing.room, roomOther: body.roomOther ?? existing.roomOther }),
      eventId: body.eventId === undefined ? existing.eventId : await cleanEventId(body.eventId),
      agenda: Array.isArray(body.agenda) ? body.agenda.filter((a) => a.trim()) : existing.agenda,
      attendees: { create: attendeeIds.map((userId) => ({ userId })) },
    },
  });

  const m = await prisma.meeting.findUnique({ where: { id } });
  let teamsWarning = null;
  let teamsLive = false; // is there a Teams event now (so Exchange handles invites)?
  try {
    if (cleanMode === 'offline' || manualLink) {
      // No auto-Teams needed now — cancel any event we'd created (sends cancellations).
      if (existing.msEventId) { await deleteTeamsEvent(existing.ownerId, existing.msEventId); await prisma.meeting.update({ where: { id }, data: { msEventId: null } }); }
    } else {
      const payload = await teamsPayload({ ...m, attendeeIds });
      if (existing.msEventId) {
        const t = await updateTeamsEvent(existing.ownerId, existing.msEventId, payload);
        if (t?.joinUrl) await prisma.meeting.update({ where: { id }, data: { meetingLink: t.joinUrl } });
        teamsLive = true;
      } else {
        const t = await createTeamsEvent(existing.ownerId, payload);
        if (t?.joinUrl) { await prisma.meeting.update({ where: { id }, data: { meetingLink: t.joinUrl, msEventId: t.id } }); teamsLive = true; }
        else teamsWarning = 'Connect Microsoft in Profile to auto-create a Teams link.';
      }
    }
  } catch (e) {
    teamsWarning = e.message || 'Could not update the Teams meeting.';
  }

  // Exchange re-issues invites when the Teams event was updated; only ICKU-invite
  // (bumped SEQUENCE) when there's no Teams event to carry the change.
  const invited = teamsLive
    ? { sent: attendeeIds.filter((uid) => uid !== existing.ownerId).length, via: 'outlook' }
    : await sendMeetingInvites(id).catch((e) => { console.error('[invites] update', e.message); return null; });

  const shaped = await get(id);
  return { ...shaped, ...(teamsWarning ? { teamsWarning } : {}), ...(invited ? { invited } : {}) };
}

// Cancel a meeting — deletes the Teams event (sending cancellations) then the
// ICKU meeting. Owner or admin only.
export async function remove(user, id) {
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (!canManage(m, user)) throw new ApiError(403, 'Only the chair (or an admin) can cancel this meeting');
  // Deleting the Teams event makes Exchange send the cancellations. Only send our
  // own .ics CANCEL when there's no Teams event (else attendees get two).
  if (m.msEventId) {
    await deleteTeamsEvent(m.ownerId, m.msEventId).catch((e) => console.error('[teams] cancel', e.message));
  } else {
    await sendMeetingInvites(id, { method: 'CANCEL' }).catch((e) => console.error('[invites] cancel', e.message));
  }
  await prisma.meeting.delete({ where: { id } });
  return { ok: true };
}

// Minutes only open up once the meeting has actually started — you can't write
// up a meeting that hasn't happened. Mirrors the UI, which hides the section.
export function hasStarted(m) {
  const { startDateTime } = istWindow(m.date, m.time, m.durationMin);
  // startDateTime is IST wall-clock — turn it into a real instant (IST = UTC+5:30)
  // so this is correct whatever timezone the server runs in.
  const startUtcMs = Date.parse(`${startDateTime}Z`) - 330 * 60000;
  return Date.now() >= startUtcMs;
}

export async function updateMinutes(id, { minutes, fileUrl, fileName } = {}) {
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) throw new ApiError(404, 'Meeting not found');
  if (!hasStarted(m)) throw new ApiError(400, 'Minutes can be added once the meeting has started');
  await prisma.meeting.update({
    where: { id },
    data: {
      minutes: minutes ?? m.minutes,
      minutesFileUrl: fileUrl === undefined ? undefined : fileUrl || null,
      minutesFileName: fileName === undefined ? undefined : fileName || null,
    },
  });
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
