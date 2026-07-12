import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

// Every managed dropdown: its key, label, and the User column it populates
// (used for usage counts + keeping employees in sync on rename).
export const MASTER_TYPES = [
  { type: 'jobTitle', label: 'Job Title', field: 'jobTitle' },
  { type: 'subDepartment', label: 'Sub Department', field: 'subDepartment' },
  { type: 'tier', label: 'Tier', field: 'tier' },
  { type: 'location', label: 'Location', field: 'location' },
  { type: 'country', label: 'Country', field: 'country' },
  { type: 'shiftPolicy', label: 'Shift Policy', field: 'shiftPolicy' },
  { type: 'weeklyOffPolicy', label: 'Weekly Off Policy', field: 'weeklyOffPolicy' },
  { type: 'attendanceTrackingPolicy', label: 'Attendance Time Tracking Policy', field: 'attendanceTrackingPolicy' },
  { type: 'attendanceCaptureScheme', label: 'Attendance Capture Scheme', field: 'attendanceCaptureScheme' },
  { type: 'holidayList', label: 'Holiday List', field: 'holidayList' },
  { type: 'leavePlan', label: 'Leave Plan', field: 'leavePlan' },
  { type: 'expensePolicy', label: 'Expense Policy', field: 'expensePolicy' },
  { type: 'noticePeriod', label: 'Notice Period', field: 'noticePeriod' },
  { type: 'workerType', label: 'Worker Type', field: 'workerType' },
  { type: 'timeType', label: 'Time Type', field: 'timeType' },
  { type: 'band', label: 'Band', field: 'band' },
  { type: 'payGrade', label: 'Pay Grade', field: 'payGrade' },
  { type: 'gender', label: 'Gender', field: 'gender' },
  { type: 'maritalStatus', label: 'Marital Status', field: 'maritalStatus' },
  { type: 'bloodGroup', label: 'Blood Group', field: 'bloodGroup' },
];
const TYPE = Object.fromEntries(MASTER_TYPES.map((t) => [t.type, t]));

const usageOf = (type, value) => prisma.user.count({ where: { [TYPE[type].field]: value } });

// Master types with total / active counts (for the admin left rail).
export async function listTypes() {
  const [all, active] = await Promise.all([
    prisma.masterOption.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.masterOption.groupBy({ by: ['type'], where: { active: true }, _count: { _all: true } }),
  ]);
  const total = Object.fromEntries(all.map((g) => [g.type, g._count._all]));
  const act = Object.fromEntries(active.map((g) => [g.type, g._count._all]));
  return MASTER_TYPES.map((t) => ({ type: t.type, label: t.label, count: total[t.type] || 0, active: act[t.type] || 0 }));
}

// Active options for dropdowns (any authenticated user).
export async function activeOptions(type) {
  if (!TYPE[type]) throw new ApiError(404, `Unknown master type: ${type}`);
  const opts = await prisma.masterOption.findMany({ where: { type, active: true }, orderBy: [{ sort: 'asc' }, { value: 'asc' }] });
  return opts.map((o) => o.value);
}

// Full option list with usage counts (admin view; supports search).
export async function adminOptions(type, q) {
  if (!TYPE[type]) throw new ApiError(404, `Unknown master type: ${type}`);
  const where = { type, ...(q ? { value: { contains: q, mode: 'insensitive' } } : {}) };
  const opts = await prisma.masterOption.findMany({ where, orderBy: [{ sort: 'asc' }, { value: 'asc' }] });
  return Promise.all(opts.map(async (o) => ({ id: o.id, value: o.value, active: o.active, meta: o.meta || null, inUse: await usageOf(type, o.value) })));
}

export async function createOption(type, value) {
  if (!TYPE[type]) throw new ApiError(404, `Unknown master type: ${type}`);
  const v = (value || '').trim();
  if (!v) throw new ApiError(400, 'Value is required');
  const dup = await prisma.masterOption.findUnique({ where: { type_value: { type, value: v } } });
  if (dup) throw new ApiError(409, 'That value already exists');
  const max = await prisma.masterOption.aggregate({ where: { type }, _max: { sort: true } });
  return prisma.masterOption.create({ data: { type, value: v, sort: (max._max.sort ?? 0) + 1 } });
}

export async function updateOption(id, { value, active, meta }) {
  const o = await prisma.masterOption.findUnique({ where: { id } });
  if (!o) throw new ApiError(404, 'Option not found');
  const data = {};
  if (meta !== undefined) data.meta = meta;
  if (value !== undefined) {
    const v = value.trim();
    if (!v) throw new ApiError(400, 'Value cannot be empty');
    if (v !== o.value) {
      const dup = await prisma.masterOption.findUnique({ where: { type_value: { type: o.type, value: v } } });
      if (dup) throw new ApiError(409, 'That value already exists');
      // keep employees consistent — rename their stored value too
      await prisma.user.updateMany({ where: { [TYPE[o.type].field]: o.value }, data: { [TYPE[o.type].field]: v } });
    }
    data.value = v;
  }
  if (active !== undefined) data.active = !!active;
  return prisma.masterOption.update({ where: { id }, data });
}

export async function removeOption(id) {
  const o = await prisma.masterOption.findUnique({ where: { id } });
  if (!o) throw new ApiError(404, 'Option not found');
  const inUse = await usageOf(o.type, o.value);
  if (inUse > 0) {
    throw new ApiError(409, `Can't delete — assigned to ${inUse} employee${inUse === 1 ? '' : 's'}. Reassign them first, or deactivate it instead.`);
  }
  await prisma.masterOption.delete({ where: { id } });
  return { ok: true };
}
