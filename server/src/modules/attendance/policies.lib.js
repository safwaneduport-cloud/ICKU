// Resolves HR policies into attendance behaviour: which weekdays are the weekly
// off, and when a shift starts (for late detection). Weekly-off day sets can be
// overridden per policy via MasterOption.meta.offDays (HR-definable).
import { prisma } from '../../config/prisma.js';

// weekday numbers: 0=Sun … 6=Sat
export const WEEKLYOFF_DEFAULTS = {
  'General Weekly Off': [0],
  'Sunday Weekly Off': [0],
  'Thursday Weekly Off': [4],
  'Monday Weekly Off': [1],
  'Sales Weekly Off': [4],
  'Tech Department Weekly Off': [0, 6],
  'Weekly 1-day Weekly Off': [0],
  'Full Day Weekly Off': [0],
  'Monthly 4days off': [0],
  'Monthly 8 days off': [0, 6],
  'Monthly 11 days weekoff': [0, 6],
};

export function defaultOffDays(name) {
  return WEEKLYOFF_DEFAULTS[name] || [0];
}

// Off-weekdays for a policy: MasterOption.meta.offDays if HR defined it, else default.
export async function offDaysForPolicy(name) {
  if (!name) return [0];
  const opt = await prisma.masterOption.findUnique({ where: { type_value: { type: 'weeklyOffPolicy', value: name } } });
  const meta = opt?.meta;
  if (meta && Array.isArray(meta.offDays)) return meta.offDays;
  return defaultOffDays(name);
}

// Minutes-from-midnight the shift starts (for late detection). Null = flexi / unknown.
export function shiftStartMinutes(shiftName) {
  if (!shiftName) return null;
  const m = shiftName.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null; // e.g. "Flexi Shift"
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}
