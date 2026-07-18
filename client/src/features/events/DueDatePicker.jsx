import { useState } from 'react';
import { fmtTime } from './meta.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DEFAULT_TIME = '18:00'; // end of the workday — a sensible due time when the user doesn't set one

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((midnight(a) - midnight(b)) / 86400000);

/**
 * Pick a task's due date + time from a calendar, but store it as an offset from
 * the event's trigger date (the `anchor`), so a yearly event's tasks still land
 * correctly next cycle. Expands inline rather than as an overlay, so it can't be
 * clipped by the scrolling modal or cover the sticky footer.
 *
 * value = { dueOffset: number|null, dueTime: string|null }
 */
export default function DueDatePicker({ anchor, value, onChange }) {
  const [open, setOpen] = useState(false);
  const hasDue = value.dueOffset != null && value.dueOffset !== '';
  const selected = hasDue ? new Date(anchor.getTime() + Number(value.dueOffset) * 86400000) : null;

  // Which month the grid is showing. Starts on the selected due date, else the anchor.
  const [view, setView] = useState(() => {
    const base = selected || anchor;
    return { year: base.getFullYear(), month: base.getMonth() }; // month 0-11
  });

  const pickDay = (day) => {
    const picked = new Date(view.year, view.month, day);
    onChange({ dueOffset: dayDiff(picked, anchor), dueTime: value.dueTime || DEFAULT_TIME });
  };
  const clear = () => { onChange({ dueOffset: null, dueTime: null }); setOpen(false); };
  const shift = (delta) => setView((v) => {
    const m = v.month + delta;
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const first = new Date(view.year, view.month, 1);
  const lead = first.getDay();
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const label = hasDue
    ? `${selected.toLocaleDateString([], { month: 'short', day: 'numeric' })}${value.dueTime ? `, ${fmtTime(value.dueTime)}` : ''}`
    : 'Set due date';

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${hasDue ? 'border-line text-ink' : 'border-dashed border-line text-ink-soft'} hover:border-pine`}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" strokeLinecap="round" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="mt-2 w-64 rounded-xl border border-line bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className="rounded px-2 py-0.5 text-ink-soft hover:bg-paper">‹</button>
            <span className="text-[13px] font-semibold text-ink">{MONTH_FULL[view.month]} {view.year}</span>
            <button type="button" onClick={() => shift(1)} className="rounded px-2 py-0.5 text-ink-soft hover:bg-paper">›</button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-[10px] text-ink-soft/70">
            {DOW.map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const isSel = selected && dayDiff(new Date(view.year, view.month, d), selected) === 0;
              const isAnchor = dayDiff(new Date(view.year, view.month, d), anchor) === 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`flex h-7 items-center justify-center rounded-full text-[12px] ${
                    isSel ? 'bg-pine font-semibold text-white'
                      : isAnchor ? 'bg-pine-tint text-pine' : 'text-ink hover:bg-paper'
                  }`}
                  title={isAnchor ? 'Project date' : undefined}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
            <label className="flex items-center gap-1.5 text-ink-soft">
              Time
              <input
                type="time"
                value={value.dueTime || ''}
                onChange={(e) => onChange({ dueOffset: hasDue ? value.dueOffset : 0, dueTime: e.target.value || null })}
                className="rounded border border-line px-1.5 py-1 text-ink outline-none focus:border-pine"
              />
            </label>
            <div className="flex gap-2">
              {hasDue && <button type="button" onClick={clear} className="text-ink-soft hover:text-brick">Clear</button>}
              <button type="button" onClick={() => setOpen(false)} className="font-medium text-pine">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
