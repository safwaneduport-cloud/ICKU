import { useState } from 'react';
import DueDatePicker from '../events/DueDatePicker.jsx';
import { anchorDate, triggerLabel } from '../events/meta.js';

// Inline panel to move a direct (ad-hoc) task into a project. The user picks one
// of their projects; for a dated project they set the task's due date (pre-filled
// from the direct task's own due), stored as an offset from the project trigger —
// exactly like any task created in the project. Undated projects have no anchor,
// so the task's absolute due date is dropped.
export default function AttachToProjectControl({ task, projects = [], busy, loadingProjects = false, onAttach, onCancel }) {
  const [eventId, setEventId] = useState('');
  const [due, setDue] = useState({ dueOffset: null, dueTime: null });

  const proj = projects.find((p) => p.id === eventId) || null;
  const dated = !!proj && proj.status === 'confirmed' && !!proj.triggerMonth;
  const anchor = dated ? anchorDate(proj.triggerMonth, proj.triggerDay) : null;

  const pickProject = (id) => {
    setEventId(id);
    const p = projects.find((x) => x.id === id);
    const isDated = p && p.status === 'confirmed' && !!p.triggerMonth;
    if (!isDated) { setDue({ dueOffset: null, dueTime: null }); return; }
    // Map the direct task's absolute due date onto an offset from this project's
    // trigger (clamped to the trigger day at the earliest); default to the trigger.
    const a = anchorDate(p.triggerMonth, p.triggerDay);
    let off = 0;
    if (task.dueDate) {
      const d = new Date(`${task.dueDate}T00:00:00`);
      if (!isNaN(d)) off = Math.max(0, Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000));
    }
    setDue({ dueOffset: off, dueTime: task.dueTime || '18:00' });
  };

  const canAttach = !!eventId && (!dated || (due.dueOffset != null && due.dueOffset !== '')) && !busy;

  return (
    <div className="mt-1.5 rounded-lg border border-line bg-paper/60 p-2.5">
      {projects.length === 0 ? (
        <p className="text-[11px] text-ink-soft">{loadingProjects ? 'Loading projects…' : "You don't own any projects to move this into yet."}</p>
      ) : (
        <>
          <label className="block text-[11px] font-medium text-ink-soft">Add to project
            <select value={eventId} onChange={(e) => pickProject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.status === 'confirmed' && p.triggerMonth ? ` · ${triggerLabel(p)}` : ' · undated'}
                </option>
              ))}
            </select>
          </label>
          {proj && dated && (
            <div className="mt-2">
              <span className="text-[11px] text-ink-soft">Due date (on or after the project date)</span>
              {/* key on the project so the calendar re-syncs its month when the
                  chosen project changes (DueDatePicker seeds its view once). */}
              <div className="mt-1"><DueDatePicker key={eventId} anchor={anchor} value={due} onChange={setDue} required /></div>
            </div>
          )}
          {proj && !dated && (
            <p className="mt-2 text-[11px] text-ink-soft">This project has no set dates, so the task's due date will be cleared.</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button disabled={!canAttach}
              onClick={() => onAttach({ eventId, dueOffset: dated ? Number(due.dueOffset) : null, dueTime: dated ? (due.dueTime || null) : null })}
              className="rounded-lg bg-pine px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              {busy ? 'Adding…' : 'Add to project'}
            </button>
            <button disabled={busy} onClick={onCancel} className="text-[11px] text-ink-soft hover:text-ink disabled:opacity-40">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
