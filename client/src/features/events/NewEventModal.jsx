import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createEvent } from '../../api/events.api.js';
import { MONTHS } from './meta.js';
import AssignPicker from './AssignPicker.jsx';

// Shared by Tasks & Events and the Institutional Calendar (which prefills the
// date from the clicked day). The footer is sticky so Create is always reachable,
// and the people picker expands inline so it can't cover it.
export default function NewEventModal({ onClose, onCreated, initialMonth, initialDay }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [dated, setDated] = useState(true);
  const [month, setMonth] = useState(initialMonth ?? 7);
  const [day, setDay] = useState(initialDay ?? 1);
  const [writeup, setWriteup] = useState('');
  const [tasks, setTasks] = useState([{ name: '', assignees: [], dueOffset: 0 }]);
  const taskRefs = useRef([]);

  const setTask = (i, patch) => setTasks((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTask = (focusIt = true) => {
    setTasks((ts) => [...ts, { name: '', assignees: [], dueOffset: 0 }]);
    if (focusIt) setTimeout(() => taskRefs.current[tasks.length]?.focus(), 0);
  };

  const mut = useMutation({
    mutationFn: () => createEvent({
      name: name.trim(),
      status: dated ? 'confirmed' : 'tbd',
      triggerMonth: dated ? month : null,
      triggerDay: dated ? day : null,
      writeup: writeup.trim(),
      tasks: tasks.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), assignees: t.assignees, dueOffset: dated ? t.dueOffset : null })),
    }),
    onSuccess: () => { qc.invalidateQueries(); onCreated?.(); onClose(); },
  });

  const canSave = !!name.trim() && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New event</h3>
        <p className="mt-1 text-xs text-ink-soft">Unless you're the CEO, this is sent to your reporting manager for approval.</p>

        <label className="mt-4 block text-sm"><span className="text-ink-soft">Event name</span>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); taskRefs.current[0]?.focus(); } }}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="e.g. Orientation Day" />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Trigger</span>
            <select value={dated ? 'fixed' : 'tbd'} onChange={(e) => setDated(e.target.value === 'fixed')} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
              <option value="fixed">Fixed date</option><option value="tbd">Date TBD</option>
            </select>
          </label>
          {dated && (
            <>
              <label className="block text-sm"><span className="text-ink-soft">Month</span>
                <select value={month} onChange={(e) => setMonth(+e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
                  {MONTHS.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
                </select>
              </label>
              <label className="block text-sm"><span className="text-ink-soft">Day</span>
                <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(+e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
              </label>
            </>
          )}
        </div>

        <label className="mt-3 block text-sm"><span className="text-ink-soft">SOP write-up</span>
          <textarea rows={2} value={writeup} onChange={(e) => setWriteup(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="How this event is run…" />
        </label>

        <div className="mt-3 text-sm">
          <span className="text-ink-soft">Tasks</span>
          <div className="mt-1 space-y-3">
            {tasks.map((t, i) => (
              <div key={i} className="rounded-lg border border-line/70 p-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    ref={(el) => { taskRefs.current[i] = el; }}
                    value={t.name}
                    onChange={(e) => setTask(i, { name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (t.name.trim() && i === tasks.length - 1) addTask(); } }}
                    placeholder={`Task ${i + 1}`} className="rounded-lg border border-line px-3 py-2" />
                  {dated && (
                    <div className="flex items-center gap-1 rounded-lg border border-line px-2 text-xs text-ink-soft">
                      Due + <input type="number" min={0} value={t.dueOffset} onChange={(e) => setTask(i, { dueOffset: Math.max(0, +e.target.value) })} className="w-12 border-none text-center outline-none" /> d
                    </div>
                  )}
                </div>
                <div className="mt-2"><AssignPicker value={t.assignees} onChange={(arr) => setTask(i, { assignees: arr })} /></div>
                {tasks.length > 1 && (
                  <button type="button" onClick={() => setTasks((ts) => ts.filter((_, idx) => idx !== i))}
                    className="mt-1 text-xs text-ink-soft hover:text-brick">Remove task</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addTask()} className="mt-2 text-sm text-pine hover:underline">+ Add another task</button>
        </div>

        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}

        {/* sticky footer — always reachable no matter how long the form gets */}
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 flex items-center justify-end gap-2 border-t border-line bg-white px-6 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {mut.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}
