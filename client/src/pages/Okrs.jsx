import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getReports } from '../api/users.api.js';
import {
  getDuties, addDuty, deleteDuty,
  getOkrs, addOkr, updateOkr, deleteOkr, approveOkrs,
  getChecklist, addChecklistItem, deleteChecklistItem, toggleChecklistItem,
} from '../api/personal.api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FREQS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

export default function Okrs() {
  const { user } = useAuth();
  const reports = useQuery({ queryKey: ['my-reports', user?.id], queryFn: () => getReports(user.id), enabled: !!user?.id, retry: false });
  const [target, setTarget] = useState(user?.id);
  const [tab, setTab] = useState('okrs');

  const people = [{ id: user?.id, name: `${user?.name} (me)` }, ...(reports.data || []).map((r) => ({ id: r.id, name: r.name }))];
  const isSelf = target === user?.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold text-pine">OKRs &amp; Checklists</h1>
        {(reports.data || []).length > 0 && (
          <label className="text-sm text-ink-soft">
            Viewing:{' '}
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm text-ink">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        {[['responsibilities', 'Responsibilities'], ['okrs', 'OKRs'], ['checklist', 'Checklists']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'responsibilities' && <Duties userId={target} isSelf={isSelf} />}
      {tab === 'okrs' && <OkrsTab userId={target} isSelf={isSelf} />}
      {tab === 'checklist' && <ChecklistTab userId={target} />}
    </div>
  );
}

// ── Responsibilities (manager-set) ──
function Duties({ userId, isSelf }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['duties', userId], queryFn: () => getDuties(userId), retry: false });
  const [text, setText] = useState('');
  const add = useMutation({ mutationFn: () => addDuty(userId, text.trim()), onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['duties', userId] }); } });
  const del = useMutation({ mutationFn: deleteDuty, onSuccess: () => qc.invalidateQueries({ queryKey: ['duties', userId] }) });

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm text-ink-soft">{isSelf ? 'Responsibilities are set by your reporting manager.' : 'Set responsibilities for this report.'}</p>
      <div className="mt-3 space-y-2">
        {(q.data || []).map((d) => (
          <div key={d.id} className="flex items-center gap-3 border-b border-line/60 pb-2 last:border-0">
            <span className="flex-1 text-sm">{d.text}</span>
            {!isSelf && <button onClick={() => del.mutate(d.id)} className="text-xs text-ink-soft hover:text-brick">Remove</button>}
          </div>
        ))}
      </div>
      {!isSelf && (
        <div className="mt-3 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a responsibility…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
          <button onClick={() => add.mutate()} disabled={!text.trim()} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Add</button>
        </div>
      )}
    </div>
  );
}

// ── OKRs (month-scoped) ──
function OkrsTab({ userId, isSelf }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const key = ['okrs', userId, ym.year, ym.month];
  const q = useQuery({ queryKey: key, queryFn: () => getOkrs(userId, ym.year, ym.month), retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const upd = useMutation({ mutationFn: ({ id, patch }) => updateOkr(id, patch), onSuccess: invalidate });
  const del = useMutation({ mutationFn: deleteOkr, onSuccess: invalidate });
  const approve = useMutation({ mutationFn: (approved) => approveOkrs({ userId, year: ym.year, month: ym.month, approved }), onSuccess: invalidate });
  const [obj, setObj] = useState('');
  const [tgt, setTgt] = useState('');
  const add = useMutation({ mutationFn: () => addOkr({ userId, year: ym.year, month: ym.month, objective: obj.trim(), target: tgt.trim() }), onSuccess: () => { setObj(''); setTgt(''); invalidate(); } });

  const shift = (delta) => setYm((s) => { let m = s.month + delta, y = s.year; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return { year: y, month: m }; });
  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded border border-line px-2 py-1 text-sm">‹</button>
          <span className="font-serif text-lg font-semibold">{MONTHS[ym.month - 1]} {ym.year}</span>
          <button onClick={() => shift(1)} className="rounded border border-line px-2 py-1 text-sm">›</button>
          {d?.approved && <span className="rounded bg-sage-tint px-2 py-0.5 text-xs font-medium text-sage">Approved</span>}
        </div>
        {!isSelf && d && (
          <button onClick={() => approve.mutate(!d.approved)} disabled={!d.allFilled && !d.approved}
            className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {d.approved ? 'Unapprove' : 'Approve OKRs'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="px-4 py-3">Objective</th><th className="px-4 py-3">Target</th><th className="px-4 py-3 w-28">% Achieved</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {(d?.items || []).map((o) => (
              <tr key={o.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{o.objective}</td>
                <td className="px-4 py-2.5 text-ink-soft">{o.target}</td>
                <td className="px-4 py-2.5">
                  <input type="number" min={0} max={100} defaultValue={o.percent ?? ''} placeholder="—"
                    onBlur={(e) => { const v = e.target.value; if (String(o.percent ?? '') !== v) upd.mutate({ id: o.id, patch: { percent: v === '' ? null : Number(v) } }); }}
                    className="w-20 rounded border border-line px-2 py-1 text-sm" />
                </td>
                <td className="px-4 py-2.5"><button onClick={() => del.mutate(o.id)} className="text-xs text-ink-soft hover:text-brick">Delete</button></td>
              </tr>
            ))}
            {(d?.items || []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-soft">No objectives for this month.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={obj} onChange={(e) => setObj(e.target.value)} placeholder="New objective…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
        <input value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="Target" className="w-32 rounded-lg border border-line px-3 py-2 text-sm" />
        <button onClick={() => add.mutate()} disabled={!obj.trim()} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Add OKR</button>
      </div>
    </div>
  );
}

// ── Checklists (recurring) ──
function ChecklistTab({ userId }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checklist', userId], queryFn: () => getChecklist(userId), retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['checklist', userId] });
  const toggle = useMutation({ mutationFn: toggleChecklistItem, onSuccess: invalidate });
  const del = useMutation({ mutationFn: deleteChecklistItem, onSuccess: invalidate });
  const add = useMutation({ mutationFn: ({ frequency, text }) => addChecklistItem({ userId, frequency, text }), onSuccess: invalidate });
  const [drafts, setDrafts] = useState({});

  const d = q.data || {};
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FREQS.map((f) => (
        <section key={f} className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{f}</div>
          <div className="mt-3 space-y-1.5">
            {(d[f] || []).map((it) => (
              <div key={it.id} className="group flex items-center gap-2">
                <button onClick={() => toggle.mutate(it.id)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${it.checked ? 'border-sage bg-sage text-white' : 'border-line'}`}>
                  {it.checked ? '✓' : ''}
                </button>
                <span className={`flex-1 text-sm ${it.checked ? 'text-ink-soft line-through' : ''}`}>{it.text}</span>
                <button onClick={() => del.mutate(it.id)} className="text-xs text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">✕</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={drafts[f] || ''} onChange={(e) => setDrafts((s) => ({ ...s, [f]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && (drafts[f] || '').trim()) { add.mutate({ frequency: f, text: drafts[f].trim() }); setDrafts((s) => ({ ...s, [f]: '' })); } }}
              placeholder={`Add ${f.toLowerCase()} item…`} className="flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" />
          </div>
        </section>
      ))}
    </div>
  );
}
