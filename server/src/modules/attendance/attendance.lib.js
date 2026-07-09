// Shared attendance helpers — used by both the API service and the seed.

// Company holidays (month is 1-12). Weekly off = Sunday.
export const HOLIDAYS = [
  { month: 5, day: 1, name: 'May Day' },
  { month: 5, day: 27, name: 'State Holiday' },
  { month: 8, day: 15, name: 'Independence Day' },
  { month: 9, day: 2, name: 'Onam' },
  { month: 10, day: 20, name: 'Diwali' },
  { month: 12, day: 25, name: 'Christmas' },
];

export const holidayOf = (month1, day) =>
  HOLIDAYS.find((h) => h.month === month1 && h.day === day) || null;

// Local-date "YYYY-MM-DD" (avoids UTC off-by-one).
export const ymd = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const fmtTime = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Arrivals at or before 09:15 count as on-time; later = late.
export const WORK_START_GRACE = 9 * 60 + 15;

const SOURCES = ['Web Check-in', 'Mobile App', 'Biometric', 'Face Recognition', 'GPS Check-in'];

// Deterministic generator for seeding historical days.
// Returns a record payload, or null for a non-working day (weekly off / holiday).
export function seedDay(userId, date) {
  if (date.getDay() === 0) return null; // Sunday = weekly off (not stored)
  const m1 = date.getMonth() + 1;
  const d = date.getDate();
  if (holidayOf(m1, d)) return null; // holiday (not stored)

  const base = (userId.charCodeAt(0) || 65) + userId.length + date.getMonth() * 3;
  const s = (base + d * 5) % 19;

  let status = 'present';
  if (s === 4) status = 'absent';
  else if (s === 9 || s === 13) status = 'half';
  else if (s === 2 || s === 7 || s === 16) status = 'late';

  if (status === 'absent') {
    return { status, checkIn: null, checkOut: null, hours: null, source: null };
  }

  const inMin = status === 'late' ? 9 * 60 + 40 + (s % 12) : 9 * 60 + (s % 14);
  const outMin = status === 'half' ? 13 * 60 + 15 + (s % 10) : 18 * 60 + (s % 25);
  const hours = +(((outMin - inMin) / 60).toFixed(1));
  return {
    status,
    checkIn: fmtTime(inMin),
    checkOut: fmtTime(outMin),
    hours,
    source: SOURCES[(base + d) % 5],
  };
}
