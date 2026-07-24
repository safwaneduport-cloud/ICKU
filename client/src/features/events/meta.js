// Project state colour code (also drives the Institutional Calendar):
//  Blue = upcoming (trigger not started) · Yellow = current (started, nothing
//  overdue) · Red = overdue (any task past due) · Green = completed (all done).
export const STATE = {
  undated: { label: 'Undated', c: '#6B7280', b: '#EDEEF0' },
  upcoming: { label: 'Upcoming', c: '#2563A8', b: '#E1ECF8' },   // blue
  current: { label: 'Current', c: '#9A6312', b: '#FBF0D2' },     // yellow / amber
  overdue: { label: 'Overdue', c: '#9C3A2A', b: '#F3E1DC' },     // red
  completed: { label: 'Completed', c: '#2C7A57', b: '#E2EFE7' }, // green
};

export const FILTERS = [
  ['all', 'All'], ['overdue', 'Overdue'], ['current', 'Current'],
  ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['undated', 'Undated'],
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const triggerLabel = (e) =>
  e.status === 'confirmed' && e.triggerMonth ? `${MONTHS[e.triggerMonth - 1]} ${e.triggerDay}` : '—';

// "Aug 30, 2026" for a project deadline ("YYYY-MM-DD"); "" when none.
export const deadlineLabel = (deadline) => {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return '';
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

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

// The academic-cycle Date for a given month/day (the anchor a task's due date
// is measured from). Used by the due-date picker before an event is saved.
export const anchorDate = (month, day) => new Date(cycleYearFor(month), month - 1, day);

// A task's absolute due Date = trigger date + offset days, at dueTime.
// Mirrors effectiveDue() in server/src/modules/events/events.lib.js.
export function taskDueDate(event, task) {
  const trig = eventDate(event);
  if (!trig || task.dueOffset == null) return null;
  const d = new Date(trig.getTime() + task.dueOffset * 86400000);
  if (task.dueTime && /^\d{1,2}:\d{2}$/.test(task.dueTime)) {
    const [h, m] = task.dueTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

const TIME_FMT = { hour: 'numeric', minute: '2-digit' };
export const fmtTime = (hhmm) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], TIME_FMT);
};

// "Jul 6, 6:00 PM" for the calendar-picked due date; "" when there's no due.
export function dueLabel(event, task) {
  const d = taskDueDate(event, task);
  if (!d) return '';
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return task.dueTime ? `${date}, ${fmtTime(task.dueTime)}` : date;
}
