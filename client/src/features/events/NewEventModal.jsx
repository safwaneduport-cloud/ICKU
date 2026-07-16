import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createEvent } from '../../api/events.api.js';
import { MONTHS } from './meta.js';
import AssignPicker from './AssignPicker.jsx';
import SopFields from './SopFields.jsx';

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
  const [sop, setSop] = useState([]); // SOP PDFs + links -> event attachments
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
      // day may be '' while the field is being edited — settle it here too.
      triggerDay: dated ? Math.min(31, Math.max(1, parseInt(day, 10) || 1)) : null,
      writeup: writeup.trim(),
      attachments: sop,
      // dueOffset may be '' while the field is being edited — settle it to a number here.
      tasks: tasks.filter((t) => t.name.trim()).map((t) => ({
        name: t.name.trim(), assignees: t.assignees,
        dueOffset: dated ? (parseInt(t.dueOffset, 10) || 0) : null,
      })),
    }),
    onSuccess: () => { qc.invalidateQueries(); onCreated?.(); onClose(); },
  });

  const canSave = !!name.trim() && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      {/* header / scrolling body / footer — so the footer can never cover the form */}
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-line px-6 pb-3 pt-6">
          <h3 className="font-serif text-lg font-semibold">New event</h3>
          <p className="mt-1 text-xs text-ink-soft">Unless you're the CEO, this is sent to your reporting manager for approval.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        <label className="block text-sm"><span className="text-ink-soft">Event name</span>
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
                {/* Same treatment as Due: text+numeric so the field can be cleared
                    and can't drift from state; clamped to 1–31 on blur. */}
                <input
                  type="text" inputMode="numeric" value={day}
                  onChange={(e) => setDay(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => setDay(Math.min(31, Math.max(1, parseInt(day, 10) || 1)))}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
              </label>
            </>
          )}
        </div>

        <div className="mt-3 text-sm">
          <span className="text-ink-soft">SOP write-up</span>
          <div className="mt-1">
            <SopFields writeup={writeup} onWriteup={setWriteup} attachments={sop} onAttachments={setSop} />
          </div>
        </div>

        <div className="mt-3 text-sm">
          <span className="text-ink-soft">Tasks</span>
          <div className="mt-1 space-y-3">
            {tasks.map((t, i) => (
              <div key={i} className="rounded-lg border border-line/70 bg-paper/30 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Task {i + 1}</span>
                  {tasks.length > 1 && (
                    <button type="button" onClick={() => setTasks((ts) => ts.filter((_, idx) => idx !== i))}
                      className="text-xs text-ink-soft hover:text-brick">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    ref={(el) => { taskRefs.current[i] = el; }}
                    value={t.name}
                    onChange={(e) => setTask(i, { name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (t.name.trim() && i === tasks.length - 1) addTask(); } }}
                    placeholder="What needs doing?" className="rounded-lg border border-line bg-white px-3 py-2" />
                  {dated && (
                    <div className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 text-xs text-ink-soft">
                      Due +
                      <input
                        // Deliberately type=text: for type=number React compares the DOM
                        // value to state with loose equality ("012" == 12), so it skips the
                        // rewrite and the stray leading zero sticks. Text compares strictly,
                        // so state and the field can never drift apart.
                        type="text" inputMode="numeric" value={t.dueOffset}
                        onChange={(e) => setTask(i, { dueOffset: e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') })}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => { if (t.dueOffset === '') setTask(i, { dueOffset: '0' }); }}
                        className="w-10 border-none bg-transparent text-center outline-none" /> d
                    </div>
                  )}
                </div>
                <div className="mt-2"><AssignPicker value={t.assignees} onChange={(arr) => setTask(i, { assignees: arr })} /></div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addTask()}
            className="mt-3 w-full rounded-lg border border-dashed border-line py-2 text-sm font-medium text-pine hover:border-pine hover:bg-pine-tint/40">
            + Add another task
          </button>
        </div>

        {mut.error && <p className="mt-3 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-white px-6 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {mut.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}
