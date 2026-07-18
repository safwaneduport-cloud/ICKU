// Academic year 2026-27: months Apr-Dec map to 2026, Jan-Mar to 2027.
export const CYCLE_START = 2026;

export const isUndated = (e) => e.status !== 'confirmed' || !e.triggerMonth;

// Trigger Date object for a confirmed, dated event (else null).
export function triggerDate(e) {
  if (isUndated(e)) return null;
  const yr = e.triggerMonth >= 4 ? CYCLE_START : CYCLE_START + 1;
  return new Date(yr, e.triggerMonth - 1, e.triggerDay);
}

// The absolute Date a task is due: trigger date + offset days, at dueTime.
// dueTime is null for legacy tasks — those keep the old midnight semantics so
// their overdue state doesn't shift under them.
export function effectiveDue(task, trig) {
  // null offset = no due date set → not deadline-tracked. 0 = due on the event
  // day (a real deadline), so the two must stay distinct.
  if (!trig || task.dueOffset == null) return null;
  const d = new Date(trig.getTime() + task.dueOffset * 86400000);
  if (task.dueTime && /^\d{1,2}:\d{2}$/.test(task.dueTime)) {
    const [h, m] = task.dueTime.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

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
