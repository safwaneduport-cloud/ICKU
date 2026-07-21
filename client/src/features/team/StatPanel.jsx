import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

// A clickable stat tile. Clicking selects it (opening its detail list below).
function Card({ label, value, sub, tone = 'text-ink', active, onClick }) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-3 text-center transition ${active ? 'border-pine bg-pine-tint/40 ring-1 ring-pine' : 'border-line bg-paper/40 hover:border-pine'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] text-ink-soft">{sub}</div>
    </button>
  );
}

function DetailList({ title, rows, empty }) {
  return (
    <div className="mt-3 rounded-xl border border-line/70 bg-paper/30 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.length === 0 && <p className="text-sm text-ink-soft">{empty}</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2 text-sm">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.danger ? 'bg-brick' : 'bg-line'}`} />
            <span className={`flex-1 ${r.danger ? 'text-brick' : ''}`}>{r.label}{r.meta ? <span className="text-ink-soft"> · {r.meta}</span> : null}</span>
            {r.right && <span className="shrink-0 text-[11px] text-ink-soft">{r.right}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// A report's Pending / Delayed / On-time panel. The three cards are clickable —
// clicking one reveals its detail list. A month selector governs Delayed +
// On-time (Pending is always "now"). `pending(uid)` and `month(uid,y,m)` return
// normalised data; `onClear` (optional) enables the manager's Clear-pending menu.
export default function StatPanel({ title, qkey, pending, month, onClear, clearBusy, term = 'Delayed' }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [open, setOpen] = useState(null); // 'pending' | 'delayed' | 'ontime' | null
  const [menu, setMenu] = useState(false);

  const pendingQ = useQuery({ queryKey: [...qkey, 'pending'], queryFn: pending, retry: false });
  const monthQ = useQuery({ queryKey: [...qkey, 'month', ym.y, ym.m], queryFn: () => month(ym.y, ym.m), retry: false });

  const pend = pendingQ.data || [];
  const st = monthQ.data || { total: 0, delayed: 0, onTimePct: 100, habitual: false, completions: [] };
  const overdue = pend.filter((p) => p.overdue).length;
  const onTime = st.onTimePct ?? 100;
  const otTone = onTime >= 90 ? 'text-sage' : onTime >= 70 ? 'text-ochre' : 'text-brick';
  const monthLabel = `${MONTHS[ym.m - 1]} ${ym.y}`;
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;

  const shift = (delta) => setYm((s) => { let m = s.m + delta, y = s.y; if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; } return { y, m }; });
  const toggle = (k) => setOpen((o) => (o === k ? null : k));

  const delayedList = st.completions.filter((c) => c.late);
  const onTimeList = st.completions.filter((c) => !c.late && !c.byManager);

  return (
    <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-pine">{title}</h2>
        {onClear && (
          <div className="relative">
            <button disabled={!pend.length || clearBusy} onClick={() => setMenu((v) => !v)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-pine disabled:opacity-50">
              {clearBusy ? 'Clearing…' : 'Clear pending ▾'}
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                <button onClick={() => { onClear(false); setMenu(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">
                  Excuse <span className="text-ink-soft">— clear, no {term.toLowerCase()} mark</span>
                </button>
                <button onClick={() => { onClear(true); setMenu(false); }} className="block w-full border-t border-line px-3 py-2 text-left text-sm hover:bg-paper">
                  Mark as {term.toLowerCase()} <span className="text-brick">— counts against them</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Month selector governs the Delayed + On-time cards. */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[11px] text-ink-soft">{term} &amp; on-time for</span>
        <button onClick={() => shift(-1)} className="rounded border border-line px-2 py-0.5 text-sm hover:border-pine">‹</button>
        <span className="min-w-[80px] text-center text-sm font-medium">{monthLabel}</span>
        <button onClick={() => shift(1)} disabled={isThisMonth} className="rounded border border-line px-2 py-0.5 text-sm hover:border-pine disabled:opacity-40">›</button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3">
        <Card label="Pending" value={pend.length} sub={overdue ? `${overdue} overdue` : 'none overdue'}
          tone={overdue ? 'text-brick' : 'text-ink'} active={open === 'pending'} onClick={() => toggle('pending')} />
        <Card label={`${term} · ${MONTHS[ym.m - 1]}`} value={st.delayed} sub={st.habitual ? '⚠ Habitual' : st.delayed ? 'done late' : 'none late'}
          tone={st.habitual ? 'text-brick' : st.delayed ? 'text-ochre' : 'text-ink'} active={open === 'delayed'} onClick={() => toggle('delayed')} />
        <Card label={`On-time · ${MONTHS[ym.m - 1]}`} value={`${onTime}%`} sub={st.total ? `${st.total} done` : 'no data'}
          tone={otTone} active={open === 'ontime'} onClick={() => toggle('ontime')} />
      </div>

      {open === 'pending' && (
        <DetailList title={`Pending now · ${pend.length}`} empty="Nothing pending 🎉"
          rows={pend.map((p) => ({ key: p.key, label: p.label, meta: p.meta, danger: p.overdue, right: p.overdue ? 'overdue' : '' }))} />
      )}
      {open === 'delayed' && (
        <DetailList title={`${term} · ${monthLabel} · ${delayedList.length}`} empty={`No ${term.toLowerCase()} completions 🎉`}
          rows={delayedList.map((c) => ({ key: c.key, label: c.label, meta: c.meta, danger: true, right: `${fmtDate(c.completedAt)}${c.byManager ? ' · mgr' : ''}` }))} />
      )}
      {open === 'ontime' && (
        <DetailList title={`On-time · ${monthLabel} · ${onTimeList.length}`} empty="No completions this month"
          rows={onTimeList.map((c) => ({ key: c.key, label: c.label, meta: c.meta, right: fmtDate(c.completedAt) }))} />
      )}
    </section>
  );
}
