// Academic year 2026-27: months Apr-Dec map to 2026, Jan-Mar to 2027.
export const CYCLE_START = 2026;

export const isUndated = (e) => e.status !== 'confirmed' || !e.triggerMonth;

// Trigger Date object for a confirmed, dated event (else null).
export function triggerDate(e) {
  if (isUndated(e)) return null;
  const yr = e.triggerMonth >= 4 ? CYCLE_START : CYCLE_START + 1;
  return new Date(yr, e.triggerMonth - 1, e.triggerDay);
}

const effectiveDue = (task, trig) =>
  trig ? new Date(trig.getTime() + (task.dueOffset || 0) * 86400000) : null;

export const isTaskPastDue = (task, trig, today) => {
  const d = effectiveDue(task, trig);
  return d && d < today;
};

// Lifecycle state: undated | completed | overdue | current | upcoming.
export function computeState(event, today = new Date()) {
  if (isUndated(event)) return 'undated';
  const trig = triggerDate(event);
  const tasks = event.tasks || [];
  if (tasks.length && tasks.every((t) => t.completed)) return 'completed';
  if (tasks.some((t) => !t.completed && isTaskPastDue(t, trig, today))) return 'overdue';
  if (trig && trig <= today) return 'current';
  return 'upcoming';
}

export const STATE_LABEL = {
  undated: 'Undated', upcoming: 'Upcoming', current: 'Current',
  overdue: 'Overdue', completed: 'Completed',
};
