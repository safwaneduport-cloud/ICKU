import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents, createEvent } from '../api/events.api.js';
import { STATE, FILTERS, MONTHS, triggerLabel } from '../features/events/meta.js';
import AssignPicker from '../features/events/AssignPicker.jsx';
import EventDrawer from '../features/events/EventDrawer.jsx';

function Badge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}

export default function Events() {
  const [filter, setFilter] = useState('all');
  const [mine, setMine] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const q = useQuery({ queryKey: ['events', filter, mine], queryFn: () => getEvents(filter, mine), retry: false });
  const rows = q.data || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Tasks &amp; Events</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New event</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My tasks only
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {q.isLoading && <p className="px-4 py-6 text-ink-soft">Loading…</p>}
        {!q.isLoading && rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No events match this filter.</p>}
        {rows.map((e) => (
          <button key={e.id} onClick={() => setOpenId(e.id)}
            className="flex w-full items-center gap-4 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-paper">
            <div className="w-16 shrink-0 font-mono text-xs text-ink-soft">{triggerLabel(e)}</div>
            <div className="flex-1">
              <div className="font-medium">{e.name}{e.approval === 'pending' && <span className="ml-2 rounded bg-ochre-tint px-1.5 py-0.5 text-[10px] font-medium text-ochre">pending</span>}</div>
              <div className="text-xs text-ink-soft">Owner · {e.owner?.name || '—'}{e.tasksTotal ? ` · ${e.tasksDone}/${e.tasksTotal} tasks` : ''}</div>
            </div>
            <Badge state={e.state} />
          </button>
        ))}
      </div>

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewEventModal({ onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [dated, setDated] = useState(true);
  const [month, setMonth] = useState(7);
  const [day, setDay] = useState(1);
  const [writeup, setWriteup] = useState('');
  const [tasks, setTasks] = useState([{ name: '', assignees: [], dueOffset: 0 }]);

  const setTask = (i, patch) => setTasks((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const mut = useMutation({
    mutationFn: () => createEvent({
      name: name.trim(),
      status: dated ? 'confirmed' : 'tbd',
      triggerMonth: dated ? month : null,
      triggerDay: dated ? day : null,
      writeup: writeup.trim(),
      tasks: tasks.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), assignees: t.assignees, dueOffset: dated ? t.dueOffset : null })),
    }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New event</h3>
        <p className="mt-1 text-xs text-ink-soft">Unless you're the CEO, this is sent to your reporting manager for approval.</p>

        <label className="mt-4 block text-sm"><span className="text-ink-soft">Event name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="e.g. Orientation Day" />
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
          <div className="mt-1 space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2">
                <input value={t.name} onChange={(e) => setTask(i, { name: e.target.value })} placeholder={`Task ${i + 1}`} className="rounded-lg border border-line px-3 py-2" />
                {dated && (
                  <div className="flex items-center gap-1 rounded-lg border border-line px-2 text-xs text-ink-soft">
                    Due + <input type="number" min={0} value={t.dueOffset} onChange={(e) => setTask(i, { dueOffset: Math.max(0, +e.target.value) })} className="w-12 border-none text-center outline-none" /> d
                  </div>
                )}
                <div className="col-span-2"><AssignPicker value={t.assignees} onChange={(arr) => setTask(i, { assignees: arr })} /></div>
              </div>
            ))}
          </div>
          <button onClick={() => setTasks([...tasks, { name: '', assignees: [], dueOffset: 0 }])} className="mt-2 text-sm text-pine">+ Add another task</button>
        </div>

        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {mut.isPending ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}
