import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { holidayOf, ymd, fmtTime, WORK_START_GRACE } from './attendance.lib.js';

const uniq = (userId, date) => ({ userId_date: { userId, date } });

function summarize(days) {
  const worked = days.filter((x) => ['present', 'late', 'half'].includes(x.status) && x.hours);
  const count = (s) => days.filter((x) => x.status === s).length;
  const present = count('present');
  const late = count('late');
  const half = count('half');
  const daysWorked = present + late + half;
  return {
    present,
    late,
    half,
    absent: count('absent'),
    daysWorked,
    avgHours: worked.length ? +(worked.reduce((a, x) => a + x.hours, 0) / worked.length).toFixed(1) : 0,
    onTimePct: daysWorked ? Math.round((present / daysWorked) * 100) : 0,
  };
}

// Build the full month grid from stored rows + derived off/holiday/upcoming days.
export async function getMonth(userId, year, month) {
  const m0 = month - 1;
  const daysInMonth = new Date(year, m0 + 1, 0).getDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await prisma.attendanceRecord.findMany({
    where: { userId, date: { startsWith: prefix } },
  });
  const byDay = new Map(rows.map((r) => [Number(r.date.slice(8, 10)), r]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, m0, d);
    const rec = byDay.get(d);
    const hol = holidayOf(month, d);
    let status;
    if (date.getDay() === 0) status = 'off';
    else if (hol) status = 'holiday';
    else if (date > today) status = 'upcoming';
    else if (rec) status = rec.status;
    else if (date.getTime() === today.getTime()) status = 'pending';
    else status = 'absent'; // past working day with no record

    days.push({
      d,
      date: ymd(date),
      status,
      checkIn: rec?.checkIn ?? null,
      checkOut: rec?.checkOut ?? null,
      hours: rec?.hours ?? null,
      source: rec?.source ?? null,
      holiday: hol?.name ?? null,
    });
  }
  return { days, summary: summarize(days) };
}

export async function getToday(userId) {
  const date = ymd(new Date());
  const record = await prisma.attendanceRecord.findUnique({ where: uniq(userId, date) });
  return { date, record };
}

export async function checkIn(userId) {
  const date = ymd(new Date());
  const existing = await prisma.attendanceRecord.findUnique({ where: uniq(userId, date) });
  if (existing?.checkIn) throw new ApiError(409, 'You have already checked in today.');

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const status = nowMin <= WORK_START_GRACE ? 'present' : 'late';
  const checkIn = fmtTime(nowMin);

  return prisma.attendanceRecord.upsert({
    where: uniq(userId, date),
    update: { checkIn, status, source: 'Web Check-in' },
    create: { userId, date, checkIn, status, source: 'Web Check-in' },
  });
}

export async function checkOut(userId) {
  const date = ymd(new Date());
  const rec = await prisma.attendanceRecord.findUnique({ where: uniq(userId, date) });
  if (!rec || !rec.checkIn) throw new ApiError(409, 'You have not checked in today.');
  if (rec.checkOut) throw new ApiError(409, 'You have already checked out today.');

  const now = new Date();
  const outMin = now.getHours() * 60 + now.getMinutes();
  const [ih, im] = rec.checkIn.split(':').map(Number);
  const hours = +(((outMin - (ih * 60 + im)) / 60).toFixed(1));
  const status = hours > 0 && hours < 5 ? 'half' : rec.status;

  return prisma.attendanceRecord.update({
    where: uniq(userId, date),
    data: { checkOut: fmtTime(outMin), hours: hours > 0 ? hours : null, status },
  });
}

// Team dashboard — direct reports with today's status + this-month summary.
export async function getTeam(managerId, year, month) {
  const reports = await prisma.user.findMany({
    where: { reportsToId: managerId },
    select: { id: true, name: true, designation: true, departmentId: true },
    orderBy: { name: 'asc' },
  });
  const todayStr = ymd(new Date());
  const out = [];
  for (const r of reports) {
    const { days, summary } = await getMonth(r.id, year, month);
    const todayRec = days.find((x) => x.date === todayStr);
    out.push({ ...r, today: todayRec?.status ?? 'pending', summary });
  }
  return out;
}

// ── Regularizations ─────────────────────────────────────────────
export function createRegularization(userId, date, reason) {
  return prisma.regularization.create({ data: { userId, date, reason } });
}

export function listMyRegularizations(userId) {
  return prisma.regularization.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function listTeamRegularizations(managerId) {
  const reports = await prisma.user.findMany({ where: { reportsToId: managerId }, select: { id: true } });
  const ids = reports.map((r) => r.id);
  return prisma.regularization.findMany({
    where: { userId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  });
}

export async function reviewRegularization(id, reviewerId, decision) {
  const reg = await prisma.regularization.findUnique({ where: { id } });
  if (!reg) throw new ApiError(404, 'Regularization not found');
  const updated = await prisma.regularization.update({
    where: { id },
    data: { status: decision, reviewedById: reviewerId },
  });
  // If approved, mark that day present (a light-touch effect of approval).
  if (decision === 'approved') {
    await prisma.attendanceRecord.upsert({
      where: uniq(reg.userId, reg.date),
      update: { status: 'present' },
      create: { userId: reg.userId, date: reg.date, status: 'present', source: 'Regularization' },
    });
  }
  return updated;
}
