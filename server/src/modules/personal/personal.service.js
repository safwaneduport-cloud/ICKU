import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { istParts, istInstant, istMonthRange } from '../../lib/ist.js';

export const FREQS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

// Responsibilities, OKRs and checklists start empty — people/managers add their
// own real items. (We used to auto-seed starter templates on first open, but that
// filled every account with placeholder content; removed after the pilot.)

// ── Recurrence ──
const weekStart = (d) => { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x; };
function samePeriod(a, now, freq) {
  if (!a) return false;
  a = new Date(a);
  if (freq === 'Weekly') return weekStart(a).getTime() === weekStart(now).getTime();
  if (freq === 'Monthly') return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth();
  if (freq === 'Yearly') return a.getFullYear() === now.getFullYear();
  return a.toDateString() === now.toDateString();
}

// ── Duties ──
export async function getDuties(userId) {
  return prisma.duty.findMany({ where: { userId }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
}
export const addDuty = (userId, text, by) => prisma.duty.create({ data: { userId, text: text.trim(), createdById: by } });
export const deleteDuty = (id) => prisma.duty.delete({ where: { id } }).catch(() => { throw new ApiError(404, 'Duty not found'); });

// ── OKRs ──
export async function getOkrs(userId, year, month) {
  const items = await prisma.okr.findMany({ where: { userId, year, month }, orderBy: { createdAt: 'asc' } });
  const approval = await prisma.okrApproval.findUnique({ where: { userId_year_month: { userId, year, month } } });
  return { items, approved: approval?.approved || false, allFilled: items.length > 0 && items.every((i) => i.percent != null) };
}
export const addOkr = (userId, year, month, objective, target, by) =>
  prisma.okr.create({ data: { userId, year, month, objective: objective.trim(), target: (target || '').trim(), createdById: by } });
export async function updateOkr(id, patch) {
  const data = {};
  if (patch.objective !== undefined) data.objective = patch.objective;
  if (patch.target !== undefined) data.target = patch.target;
  if (patch.percent !== undefined) data.percent = patch.percent === null || patch.percent === '' ? null : Math.max(0, Math.min(100, Number(patch.percent)));
  return prisma.okr.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'OKR not found'); });
}
export const deleteOkr = (id) => prisma.okr.delete({ where: { id } }).catch(() => { throw new ApiError(404, 'OKR not found'); });
export const setApproved = (userId, year, month, approved) =>
  prisma.okrApproval.upsert({ where: { userId_year_month: { userId, year, month } }, update: { approved }, create: { userId, year, month, approved } });

// ── Checklist deadlines ──
// Applied when a manager hasn't set a custom deadline. Yearly has none.
const DEFAULT_DEADLINE = {
  Daily: { time: '18:00' },
  Weekly: { time: '18:00', weekday: 5 }, // Friday
  Monthly: { time: '18:00', dayOfMonth: 31 }, // clamped to the month's last day
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const to12h = (hhmm) => { const [h, m] = (hhmm || '18:00').split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, '0')} ${ap}`; };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };

const cfgFor = (freq, cfg) => (freq === 'Yearly' ? null : { ...DEFAULT_DEADLINE[freq], ...(cfg || {}) });

// Deadline times are wall-clock IST — computed via the shared lib/ist helpers
// (UTC+5:30, server-timezone-independent) so "6 PM" isn't misread as 6 PM server
// time on Render (UTC). See lib/ist.js.
// The current period's deadline DateTime for a user's checklist of `freq` (IST).
// Exported for timezone tests.
export function deadlineDate(freq, cfg, now) {
  const c = cfgFor(freq, cfg);
  if (!c) return null;
  const [h, m] = (c.time || '18:00').split(':').map(Number);
  const p = istParts(now);
  if (freq === 'Daily') return istInstant(p.y, p.mo, p.d, h, m);
  if (freq === 'Weekly') {
    // config weekday 0=Sun..6=Sat → its date within the current IST week (Mon-start)
    const monIdx = (dow) => (dow + 6) % 7;
    const delta = monIdx(c.weekday ?? 5) - monIdx(p.dow);
    return istInstant(p.y, p.mo, p.d + delta, h, m); // Date.UTC normalises over/underflow
  }
  if (freq === 'Monthly') {
    const last = new Date(Date.UTC(p.y, p.mo + 1, 0)).getUTCDate(); // last day of the IST month
    return istInstant(p.y, p.mo, Math.min(c.dayOfMonth ?? last, last), h, m);
  }
  return null;
}
function deadlineLabel(freq, cfg) {
  const c = cfgFor(freq, cfg);
  if (!c) return null;
  const t = to12h(c.time);
  if (freq === 'Daily') return `by ${t}`;
  if (freq === 'Weekly') return `by ${DOW[c.weekday ?? 5]} ${t}`;
  return `by the ${c.dayOfMonth === 31 ? 'last day' : ordinal(c.dayOfMonth ?? 31)} · ${t}`;
}
function periodKey(now, freq) {
  if (freq === 'Weekly') { const ws = weekStart(now); return `${ws.getFullYear()}-W${ws.getMonth() + 1}-${ws.getDate()}`; }
  if (freq === 'Monthly') return `${now.getFullYear()}-${now.getMonth() + 1}`;
  if (freq === 'Yearly') return `${now.getFullYear()}`;
  return now.toISOString().slice(0, 10);
}

// ── Checklist activity log (7-day rolling; powers history + restore) ──
async function logActivity(userId, { itemId = null, actorId = null, action, text = '', frequency = null, late = false }) {
  await prisma.checklistActivity.create({ data: { userId, itemId, actorId, action, text, frequency, late } });
  // No cron here — prune this user's rows older than 7 days on each write.
  const cutoff = new Date(Date.now() - 7 * 86400000);
  await prisma.checklistActivity.deleteMany({ where: { userId, createdAt: { lt: cutoff } } });
}

// ── Checklists ──
export async function getChecklist(userId) {
  const now = new Date();
  const currentKeys = [...new Set(FREQS.map((f) => periodKey(now, f)))];
  const [items, cfgs, comps] = await Promise.all([
    prisma.checklistItem.findMany({ where: { userId }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] }),
    prisma.checklistDeadline.findMany({ where: { userId } }),
    prisma.checklistCompletion.findMany({ where: { userId, periodKey: { in: currentKeys } } }),
  ]);
  const cfgBy = Object.fromEntries(cfgs.map((c) => [c.frequency, c]));
  const compBy = Object.fromEntries(comps.map((c) => [c.itemId, c]));
  const grouped = Object.fromEntries(FREQS.map((f) => [f, []]));
  for (const it of items) {
    const comp = compBy[it.id];
    const checked = samePeriod(it.checkedAt, now, it.frequency); // the user ticked it
    const cleared = !checked && !!comp && comp.clearedById != null; // a manager Cleared it
    const dl = deadlineDate(it.frequency, cfgBy[it.frequency], now);
    grouped[it.frequency]?.push({
      id: it.id, text: it.text, frequency: it.frequency, checked, cleared,
      clearedBlackMark: cleared && comp.late,
      deadline: deadlineLabel(it.frequency, cfgBy[it.frequency]),
      overdue: !checked && !cleared && !!dl && now > dl,
    });
  }
  return grouped;
}

// The user's uncompleted items for the current period, overdue first. Items a
// manager Cleared count as resolved and drop off the pending list.
export async function getPendingChecklist(userId) {
  const grouped = await getChecklist(userId);
  const pending = FREQS.flatMap((f) => grouped[f]).filter((it) => !it.checked && !it.cleared);
  return pending.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
}
export async function addChecklistItem(userId, frequency, text, by) {
  if (!FREQS.includes(frequency)) throw new ApiError(400, 'Invalid frequency');
  const item = await prisma.checklistItem.create({ data: { userId, frequency, text: text.trim(), createdById: by } });
  await logActivity(userId, { itemId: item.id, actorId: by, action: 'added', text: item.text, frequency });
  return item;
}
export async function updateChecklistItem(id, text, by) {
  const it = await prisma.checklistItem.findUnique({ where: { id } });
  if (!it) throw new ApiError(404, 'Item not found');
  const item = await prisma.checklistItem.update({ where: { id }, data: { text: text.trim() } });
  await logActivity(it.userId, { itemId: id, actorId: by, action: 'edited', text: item.text, frequency: it.frequency });
  return item;
}
export async function deleteChecklistItem(id, by) {
  const it = await prisma.checklistItem.findUnique({ where: { id } });
  if (!it) throw new ApiError(404, 'Item not found');
  // Snapshot BEFORE delete so it can be restored from history (itemId=null marks
  // it not-yet-restored; a restore sets it to the new item's id).
  await logActivity(it.userId, { itemId: null, actorId: by, action: 'deleted', text: it.text, frequency: it.frequency });
  return prisma.checklistItem.delete({ where: { id } });
}
export async function toggleChecklistItem(id, by) {
  const it = await prisma.checklistItem.findUnique({ where: { id } });
  if (!it) throw new ApiError(404, 'Item not found');
  const now = new Date();
  const key = periodKey(now, it.frequency);
  const wasChecked = samePeriod(it.checkedAt, now, it.frequency);

  if (wasChecked) {
    // Un-check → drop this period's completion record.
    await prisma.checklistCompletion.deleteMany({ where: { itemId: id, periodKey: key } });
    await logActivity(it.userId, { itemId: id, actorId: by, action: 'unchecked', text: it.text, frequency: it.frequency });
    return prisma.checklistItem.update({ where: { id }, data: { checkedAt: null } });
  }
  // Check → log the completion and whether it was after the deadline. clearedById
  // is reset to null so a user check always overrides any prior manager Clear.
  const cfg = await prisma.checklistDeadline.findUnique({ where: { userId_frequency: { userId: it.userId, frequency: it.frequency } } });
  const dl = deadlineDate(it.frequency, cfg, now);
  const late = !!(dl && now > dl);
  await prisma.checklistCompletion.upsert({
    where: { itemId_periodKey: { itemId: id, periodKey: key } },
    create: { itemId: id, userId: it.userId, periodKey: key, completedAt: now, dueAt: dl, late, clearedById: null },
    update: { completedAt: now, dueAt: dl, late, clearedById: null },
  });
  await logActivity(it.userId, { itemId: id, actorId: by, action: 'checked', text: it.text, frequency: it.frequency, late });
  return prisma.checklistItem.update({ where: { id }, data: { checkedAt: now } });
}

// Manager Clears an employee's currently-pending items for this period. Two
// modes: blackMark=false is an excused clear (neutral); blackMark=true records a
// black mark. Either way the items drop off the pending list; the user is never
// shown as having "checked" them.
export async function clearAllPending(actorId, userId, blackMark = false) {
  const now = new Date();
  const currentKeys = [...new Set(FREQS.map((f) => periodKey(now, f)))];
  const [items, cfgs, comps] = await Promise.all([
    prisma.checklistItem.findMany({ where: { userId } }),
    prisma.checklistDeadline.findMany({ where: { userId } }),
    prisma.checklistCompletion.findMany({ where: { userId, periodKey: { in: currentKeys } } }),
  ]);
  const cfgBy = Object.fromEntries(cfgs.map((c) => [c.frequency, c]));
  const resolved = new Set(comps.map((c) => c.itemId));
  let cleared = 0;
  for (const it of items) {
    const checked = samePeriod(it.checkedAt, now, it.frequency);
    if (checked || resolved.has(it.id)) continue; // already done/cleared
    const key = periodKey(now, it.frequency);
    const dl = deadlineDate(it.frequency, cfgBy[it.frequency], now);
    await prisma.checklistCompletion.upsert({
      where: { itemId_periodKey: { itemId: it.id, periodKey: key } },
      create: { itemId: it.id, userId, periodKey: key, completedAt: now, dueAt: dl, late: !!blackMark, clearedById: actorId },
      update: { completedAt: now, dueAt: dl, late: !!blackMark, clearedById: actorId },
    });
    await logActivity(userId, { itemId: it.id, actorId, action: 'cleared', text: it.text, frequency: it.frequency, late: !!blackMark });
    cleared += 1;
  }
  return { cleared, blackMark: !!blackMark };
}

// Last 7 days of checklist activity (newest first) with actor names; a 'deleted'
// entry is restorable until it's been restored (itemId still null).
export async function getChecklistHistory(userId) {
  const since = new Date(Date.now() - 7 * 86400000);
  const rows = await prisma.checklistActivity.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const nameBy = Object.fromEntries(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id, action: r.action, text: r.text, frequency: r.frequency, late: r.late,
    actorName: r.actorId ? nameBy[r.actorId] || '—' : null, at: r.createdAt,
    restorable: r.action === 'deleted' && r.itemId == null,
  }));
}

// Restore a deleted item from its history snapshot. Recreating it, then marking
// the 'deleted' activity consumed (itemId set) so it can't be restored twice.
export async function restoreChecklistItem(actorId, activityId) {
  const a = await prisma.checklistActivity.findUnique({ where: { id: activityId } });
  if (!a || a.action !== 'deleted') throw new ApiError(404, 'No deleted item to restore');
  if (a.itemId != null) throw new ApiError(409, 'This item was already restored');
  const item = await prisma.checklistItem.create({ data: { userId: a.userId, frequency: a.frequency || 'Daily', text: a.text, createdById: actorId } });
  await prisma.checklistActivity.update({ where: { id: activityId }, data: { itemId: item.id } });
  await logActivity(a.userId, { itemId: item.id, actorId, action: 'restored', text: a.text, frequency: a.frequency });
  return item;
}

// ── Deadline config (a manager sets these for a direct report) ──
export async function getDeadlines(userId) {
  const cfgs = await prisma.checklistDeadline.findMany({ where: { userId } });
  const by = Object.fromEntries(cfgs.map((c) => [c.frequency, c]));
  return ['Daily', 'Weekly', 'Monthly'].map((frequency) => ({
    frequency, ...DEFAULT_DEADLINE[frequency], ...(by[frequency] || {}),
    configured: !!by[frequency], label: deadlineLabel(frequency, by[frequency]),
  }));
}
export async function setDeadline(userId, frequency, { time, weekday, dayOfMonth } = {}) {
  if (!['Daily', 'Weekly', 'Monthly'].includes(frequency)) throw new ApiError(400, 'Invalid frequency');
  const data = {
    time: /^\d{1,2}:\d{2}$/.test(time || '') ? time : '18:00',
    weekday: frequency === 'Weekly' ? Math.min(6, Math.max(0, parseInt(weekday, 10) || 5)) : null,
    dayOfMonth: frequency === 'Monthly' ? Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 31)) : null,
  };
  return prisma.checklistDeadline.upsert({
    where: { userId_frequency: { userId, frequency } },
    create: { userId, frequency, ...data }, update: data,
  });
}

// Delayed-completion stats for one employee (My Team reporting). blackMarks =
// late completions (including manager clears marked as a black mark). Excused
// clears are neutral — excluded from the on-time denominator.
export async function checklistDelayStats(userId, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const [total, blackMarks, excused] = await Promise.all([
    prisma.checklistCompletion.count({ where: { userId, completedAt: { gte: since } } }),
    prisma.checklistCompletion.count({ where: { userId, late: true, completedAt: { gte: since } } }),
    prisma.checklistCompletion.count({ where: { userId, clearedById: { not: null }, late: false, completedAt: { gte: since } } }),
  ]);
  const effective = total - excused;
  return {
    total, blackMarks, excused, sinceDays,
    onTimePct: effective ? Math.round(((effective - blackMarks) / effective) * 100) : 100,
    // ≥3 black marks in the window flags a habitual pattern for the manager.
    habitual: blackMarks >= 3,
  };
}

// Delay stats for one IST calendar month — powers the Delayed + On-time cards
// and their click-through detail (the `completions` list). Excused manager
// clears are neutral (excluded from the on-time denominator).
export async function checklistMonthStats(userId, year, month) {
  const { start, end } = istMonthRange(year, month);
  const comps = await prisma.checklistCompletion.findMany({
    where: { userId, completedAt: { gte: start, lt: end } },
    orderBy: { completedAt: 'desc' },
    include: { item: { select: { text: true, frequency: true } } },
  });
  const delayed = comps.filter((c) => c.late).length;
  const excused = comps.filter((c) => c.clearedById != null && !c.late).length;
  const effective = comps.length - excused;
  return {
    year, month, total: comps.length, delayed, excused,
    onTimePct: effective ? Math.round(((effective - delayed) / effective) * 100) : 100,
    habitual: delayed >= 3,
    completions: comps.map((c) => ({
      itemText: c.item?.text || '(deleted item)', frequency: c.item?.frequency,
      completedAt: c.completedAt, dueAt: c.dueAt, late: c.late, byManager: c.clearedById != null,
    })),
  };
}

// Recent black marks (late completions) with the item text + when, for the
// manager's click-through detail.
export async function checklistBlackMarks(userId, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const rows = await prisma.checklistCompletion.findMany({
    where: { userId, late: true, completedAt: { gte: since } },
    orderBy: { completedAt: 'desc' }, take: 50,
    include: { item: { select: { text: true, frequency: true } } },
  });
  return rows.map((r) => ({
    itemText: r.item?.text || '(deleted item)', frequency: r.item?.frequency,
    completedAt: r.completedAt, dueAt: r.dueAt, byManager: r.clearedById != null,
  }));
}

// Ownership lookups (for authz in the controller).
export const dutyOwner = (id) => prisma.duty.findUnique({ where: { id }, select: { userId: true } });
export const okrOwner = (id) => prisma.okr.findUnique({ where: { id }, select: { userId: true } });
export const checklistOwner = (id) => prisma.checklistItem.findUnique({ where: { id }, select: { userId: true } });
export const checklistActivityOwner = (id) => prisma.checklistActivity.findUnique({ where: { id }, select: { userId: true } });
