import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '../api/events.api.js';
import { STATE, FILTERS, triggerLabel } from '../features/events/meta.js';
import EventDrawer from '../features/events/EventDrawer.jsx';
import NewEventModal from '../features/events/NewEventModal.jsx';

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Projects and Tasks</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New project</button>
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
        {!q.isLoading && rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No projects match this filter.</p>}
        {rows.map((e) => (
          // Phone: date and state ride above the name so the title gets the full
          // width. From sm up it's the original three-column row.
          <button key={e.id} onClick={() => setOpenId(e.id)}
            className="flex w-full flex-col gap-1 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-paper sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2 sm:contents">
              <div className="font-mono text-xs text-ink-soft sm:w-16 sm:shrink-0">{triggerLabel(e)}</div>
              <div className="ml-auto sm:hidden"><Badge state={e.state} /></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{e.name}{e.approval === 'pending' && <span className="ml-2 rounded bg-ochre-tint px-1.5 py-0.5 text-[10px] font-medium text-ochre">pending</span>}</div>
              <div className="text-xs text-ink-soft">Owner · {e.owner?.name || '—'}{e.tasksTotal ? ` · ${e.tasksDone}/${e.tasksTotal} tasks` : ''}</div>
            </div>
            <div className="hidden sm:block"><Badge state={e.state} /></div>
          </button>
        ))}
      </div>

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
