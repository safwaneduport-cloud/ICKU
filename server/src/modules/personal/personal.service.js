import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export const FREQS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

const CHECKLIST_BASE = {
  Daily: ['Review My Day dashboard & clear overdue tasks', 'Check announcements & notifications', 'Update progress on assigned tasks'],
  Weekly: ['Sync with reporting manager', 'Review team / department board', "Plan next week's priorities"],
  Monthly: ['Submit monthly progress report', 'Review KPIs against targets', 'Update the SOPs I own'],
  Yearly: ['Complete annual performance review', 'Refresh yearly objectives', 'Archive completed institutional events'],
};
const DEFAULT_DUTIES = [
  'Execute department objectives', 'Coordinate with cross-functional teams',
  'Maintain SOP compliance', 'Report progress to reporting manager',
];
const OKR_DEFAULT = [
  { objective: 'Improve on-time task completion', target: '95%' },
  { objective: 'Maintain SOP compliance', target: '100%' },
];

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
async function ensureDuties(userId) {
  if ((await prisma.duty.count({ where: { userId } })) === 0) {
    await prisma.duty.createMany({ data: DEFAULT_DUTIES.map((text, i) => ({ userId, text, sort: i })) });
  }
}
export async function getDuties(userId) {
  await ensureDuties(userId);
  return prisma.duty.findMany({ where: { userId }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
}
export const addDuty = (userId, text, by) => prisma.duty.create({ data: { userId, text: text.trim(), createdById: by } });
export const deleteDuty = (id) => prisma.duty.delete({ where: { id } }).catch(() => { throw new ApiError(404, 'Duty not found'); });

// ── OKRs ──
async function ensureOkrs(userId, year, month) {
  if ((await prisma.okr.count({ where: { userId, year, month } })) === 0) {
    await prisma.okr.createMany({ data: OKR_DEFAULT.map((o) => ({ userId, year, month, objective: o.objective, target: o.target })) });
  }
}
export async function getOkrs(userId, year, month) {
  const now = new Date();
  if (year === now.getFullYear() && month === now.getMonth() + 1) await ensureOkrs(userId, year, month);
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

// ── Checklists ──
async function ensureChecklist(userId) {
  if ((await prisma.checklistItem.count({ where: { userId } })) === 0) {
    const rows = [];
    FREQS.forEach((f) => CHECKLIST_BASE[f].forEach((text, i) => rows.push({ userId, frequency: f, text, sort: i })));
    await prisma.checklistItem.createMany({ data: rows });
  }
}
export async function getChecklist(userId) {
  await ensureChecklist(userId);
  const items = await prisma.checklistItem.findMany({ where: { userId }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
  const now = new Date();
  const grouped = Object.fromEntries(FREQS.map((f) => [f, []]));
  for (const it of items) grouped[it.frequency]?.push({ id: it.id, text: it.text, frequency: it.frequency, checked: samePeriod(it.checkedAt, now, it.frequency) });
  return grouped;
}
export const addChecklistItem = (userId, frequency, text, by) => {
  if (!FREQS.includes(frequency)) throw new ApiError(400, 'Invalid frequency');
  return prisma.checklistItem.create({ data: { userId, frequency, text: text.trim(), createdById: by } });
};
export const updateChecklistItem = (id, text) => prisma.checklistItem.update({ where: { id }, data: { text: text.trim() } }).catch(() => { throw new ApiError(404, 'Item not found'); });
export const deleteChecklistItem = (id) => prisma.checklistItem.delete({ where: { id } }).catch(() => { throw new ApiError(404, 'Item not found'); });
export async function toggleChecklistItem(id) {
  const it = await prisma.checklistItem.findUnique({ where: { id } });
  if (!it) throw new ApiError(404, 'Item not found');
  const now = new Date();
  const checkedAt = samePeriod(it.checkedAt, now, it.frequency) ? null : now;
  return prisma.checklistItem.update({ where: { id }, data: { checkedAt } });
}

// Ownership lookups (for authz in the controller).
export const dutyOwner = (id) => prisma.duty.findUnique({ where: { id }, select: { userId: true } });
export const okrOwner = (id) => prisma.okr.findUnique({ where: { id }, select: { userId: true } });
export const checklistOwner = (id) => prisma.checklistItem.findUnique({ where: { id }, select: { userId: true } });
