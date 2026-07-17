import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '../api/events.api.js';
import { STATE, MONTHS, CYCLE_START, eventDate, ymd } from '../features/events/meta.js';
import EventDrawer from '../features/events/EventDrawer.jsx';
import NewEventModal from '../features/events/NewEventModal.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The academic cycle runs Apr CYCLE_START → Mar CYCLE_START+1.
const CYCLE = Array.from({ length: 12 }, (_, i) => {
  const m = ((3 + i) % 12) + 1;                 // 4,5,…,12,1,2,3
  return { month: m, year: m >= 4 ? CYCLE_START : CYCLE_START + 1 };
});

export default function Calendar() {
  const q = useQuery({ queryKey: ['events', 'all', false], queryFn: () => getEvents('all', false), retry: false });
  const events = q.data || [];

  const today = new Date();
  const startIdx = Math.max(0, CYCLE.findIndex((c) => c.month === today.getMonth() + 1 && c.year === today.getFullYear()));
  const [idx, setIdx] = useState(startIdx);
  const [openId, setOpenId] = useState(null);
  const [newFor, setNewFor] = useState(null); // { month, day }
  const [dayFor, setDayFor] = useState(null); // phone: the day whose sheet is open

  const { month, year } = CYCLE[idx];

  // Group dated events by their real date; keep undated ones aside.
  const { byDay, undated } = useMemo(() => {
    const map = new Map();
    const un = [];
    for (const e of events) {
      const d = eventDate(e);
      if (!d) { un.push(e); continue; }
      const k = ymd(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return { byDay: map, undated: un };
  }, [events]);

  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = first.getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthCount = cells.filter(Boolean).reduce((n, d) => n + (byDay.get(ymd(new Date(year, month - 1, d)))?.length || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-pine">Institutional Calendar</h1>
          <p className="text-sm text-ink-soft">Every event on its trigger date across the {CYCLE_START}–{String(CYCLE_START + 1).slice(2)} academic year. Click any day to plan a new event.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm disabled:opacity-40">←</button>
          <span className="min-w-[9.5rem] text-center font-medium text-ink">{MONTH_FULL[month - 1]} {year}</span>
          <button onClick={() => setIdx((i) => Math.min(CYCLE.length - 1, i + 1))} disabled={idx === CYCLE.length - 1}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm disabled:opacity-40">→</button>
          <button onClick={() => setIdx(startIdx)} className="ml-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-pine">Today</button>
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {Object.entries(STATE).filter(([k]) => k !== 'undated').map(([k, m]) => (
          <span key={k} className="flex items-center gap-1.5 text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.c }} />{m.label}
          </span>
        ))}
        <span className="ml-auto text-ink-soft">{monthCount} event{monthCount === 1 ? '' : 's'} this month</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        {/* Phone month grid — a day cell is only ~45px wide, so event names are
            dots here and the detail lives in a tap-through sheet. */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white sm:hidden">
          <div className="grid grid-cols-7 border-b border-line bg-paper/60">
            {DOW.map((d) => <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{d[0]}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square border-b border-r border-line/50 bg-paper/30" />;
              const date = new Date(year, month - 1, d);
              const list = byDay.get(ymd(date)) || [];
              const isToday = date.toDateString() === today.toDateString();
              return (
                <button key={i} onClick={() => setDayFor(d)}
                  className="flex aspect-square flex-col items-center justify-center gap-1 border-b border-r border-line/50 active:bg-pine-tint/50">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-pine font-bold text-white' : 'text-ink'}`}>{d}</span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: (STATE[e.state] || STATE.upcoming).c }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* month grid */}
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-white sm:block">
          <div className="grid grid-cols-7 border-b border-line bg-paper/60">
            {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[6.5rem] border-b border-r border-line/50 bg-paper/30 last:border-r-0" />;
              const date = new Date(year, month - 1, d);
              const list = byDay.get(ymd(date)) || [];
              const isToday = date.toDateString() === today.toDateString();
              return (
                <button key={i} onClick={() => setNewFor({ month, day: d })} title="Add an event on this day"
                  className="group min-h-[6.5rem] border-b border-r border-line/50 p-1.5 text-left align-top hover:bg-pine-tint/40">
                  <div className="flex items-center justify-between">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-pine font-bold text-white' : 'text-ink-soft'}`}>{d}</span>
                    <span className="hidden text-xs text-pine group-hover:inline">＋</span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {list.slice(0, 3).map((e) => {
                      const s = STATE[e.state] || STATE.upcoming;
                      return (
                        <span key={e.id} role="button" tabIndex={0}
                          onClick={(ev) => { ev.stopPropagation(); setOpenId(e.id); }}
                          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setOpenId(e.id); } }}
                          className="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80"
                          style={{ color: s.c, background: s.b }}>
                          {e.name}
                        </span>
                      );
                    })}
                    {list.length > 3 && <span className="block px-1 text-[10px] text-ink-soft">+{list.length - 3} more</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* undated / TBD side panel */}
        <aside className="rounded-2xl border border-line bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Undated / TBD</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">No trigger date yet — they don't appear on the grid.</p>
          <div className="mt-2 space-y-1">
            {undated.length === 0 && <p className="py-3 text-center text-xs text-ink-soft">Nothing undated 🎉</p>}
            {undated.map((e) => (
              <button key={e.id} onClick={() => setOpenId(e.id)}
                className="block w-full truncate rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:border-pine">
                {e.name}
                <span className="block text-[10px] text-ink-soft">{e.owner?.name || '—'}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Phone: what's on the tapped day, and the way to add to it. */}
      {dayFor && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/40 sm:hidden" onClick={() => setDayFor(null)}>
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold text-pine">
                {new Date(year, month - 1, dayFor).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <button onClick={() => setDayFor(null)} className="rounded-lg p-1 text-ink-soft" aria-label="Close">✕</button>
            </div>
            <div className="mt-3 space-y-1.5">
              {(byDay.get(ymd(new Date(year, month - 1, dayFor))) || []).length === 0 && (
                <p className="py-3 text-center text-sm text-ink-soft">Nothing on this day.</p>
              )}
              {(byDay.get(ymd(new Date(year, month - 1, dayFor))) || []).map((e) => {
                const s = STATE[e.state] || STATE.upcoming;
                return (
                  <button key={e.id} onClick={() => { setOpenId(e.id); setDayFor(null); }}
                    className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.c }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="block truncate text-[11px] text-ink-soft">{e.owner?.name || '—'} · {s.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setNewFor({ month, day: dayFor }); setDayFor(null); }}
              className="mt-3 w-full rounded-lg bg-pine py-2.5 text-sm font-medium text-white">
              ＋ New event on this day
            </button>
          </div>
        </div>
      )}

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {newFor && (
        <NewEventModal initialMonth={newFor.month} initialDay={newFor.day} onClose={() => setNewFor(null)} />
      )}
    </div>
  );
}
