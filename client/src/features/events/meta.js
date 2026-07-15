export const STATE = {
  undated: { label: 'Undated', c: '#9A6312', b: '#F5EAD4' },
  upcoming: { label: 'Upcoming', c: '#3F6075', b: '#E3EAEF' },
  current: { label: 'Current', c: '#134535', b: '#E4EDE7' },
  overdue: { label: 'Overdue', c: '#9C3A2A', b: '#F3E1DC' },
  completed: { label: 'Completed', c: '#2C7A57', b: '#E2EFE7' },
};

export const FILTERS = [
  ['all', 'All'], ['overdue', 'Overdue'], ['current', 'Current'],
  ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['undated', 'Undated'],
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const triggerLabel = (e) =>
  e.status === 'confirmed' && e.triggerMonth ? `${MONTHS[e.triggerMonth - 1]} ${e.triggerDay}` : '—';

// Academic year 2026-27: Apr–Dec map to 2026, Jan–Mar to 2027.
// Mirrors server/src/modules/events/events.lib.js — keep the two in step.
export const CYCLE_START = 2026;
export const cycleYearFor = (month) => (month >= 4 ? CYCLE_START : CYCLE_START + 1);

// The real Date an event fires on (null for undated / TBD events).
export function eventDate(e) {
  if (e.status !== 'confirmed' || !e.triggerMonth) return null;
  return new Date(cycleYearFor(e.triggerMonth), e.triggerMonth - 1, e.triggerDay);
}

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
