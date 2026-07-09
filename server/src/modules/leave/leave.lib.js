// Shared leave config + helpers (used by API service and seed).
export const LEAVE_TYPES = [
  { id: 'casual', name: 'Casual Leave', total: 12, color: '#3F6075', sort: 1 },
  { id: 'sick', name: 'Sick Leave', total: 8, color: '#9C3A2A', sort: 2 },
  { id: 'earned', name: 'Earned Leave', total: 15, color: '#2C7A57', sort: 3 },
  { id: 'comp', name: 'Comp Off', total: 4, color: '#9A6312', sort: 4 },
  { id: 'maternity', name: 'Maternity', total: 182, color: '#134535', sort: 5 },
  { id: 'lop', name: 'Loss of Pay', total: 0, color: '#5E635B', sort: 6 },
];

// Inclusive day count between two "YYYY-MM-DD" strings; half-day = 0.5.
export function leaveDays(fromStr, toStr, half) {
  if (half) return 0.5;
  const a = new Date(fromStr);
  const b = new Date(toStr);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
