import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getReports } from '../api/users.api.js';
import {
  getDuties, addDuty, deleteDuty,
  getOkrs, addOkr, updateOkr, deleteOkr, approveOkrs,
  getChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem, toggleChecklistItem, getPendingChecklist,
  getChecklistHistory, restoreChecklistItem,
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
        {[['responsibilities', 'Responsibilities'], ['okrs', 'OKRs'], ['checklist', 'Checklists'], ['pending', 'Pending']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'responsibilities' && <Duties userId={target} isSelf={isSelf} />}
      {tab === 'okrs' && <OkrsTab userId={target} isSelf={isSelf} />}
      {tab === 'checklist' && <ChecklistTab userId={target} isSelf={isSelf} />}
      {tab === 'pending' && <PendingTab userId={target} isSelf={isSelf} />}
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
// Only the item's owner can check/uncheck (isSelf). Both owner and manager can
// add/edit/delete. Deletion asks for confirmation; a 7-day history panel lets
// either restore a deleted item.
function ChecklistTab({ userId, isSelf }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checklist', userId], queryFn: () => getChecklist(userId), retry: false });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['checklist', userId] });
    qc.invalidateQueries({ queryKey: ['checklist-history', userId] });
  };
  const toggle = useMutation({ mutationFn: toggleChecklistItem, onSuccess: invalidate });
  const del = useMutation({ mutationFn: deleteChecklistItem, onSuccess: invalidate });
  const add = useMutation({ mutationFn: ({ frequency, text }) => addChecklistItem({ userId, frequency, text }), onSuccess: invalidate });
  const edit = useMutation({ mutationFn: ({ id, text }) => updateChecklistItem(id, text), onSuccess: invalidate });
  const [drafts, setDrafts] = useState({});
  const [confirm, setConfirm] = useState(null); // item pending delete confirmation
  const [showHistory, setShowHistory] = useState(false);

  const d = q.data || {};
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">{isSelf ? 'Tick items as you complete them. Only you can check your own list.' : "You can add, edit or clear items — but only they can tick them off."}</p>
        <button onClick={() => setShowHistory((v) => !v)} className="shrink-0 text-sm font-medium text-pine hover:underline">{showHistory ? 'Hide history' : 'History'}</button>
      </div>

      {showHistory && <HistoryPanel userId={userId} onRestored={invalidate} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {FREQS.map((f) => (
          <section key={f} className="rounded-2xl border border-line bg-white p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{f}</div>
              {(d[f] || [])[0]?.deadline && <div className="text-[11px] text-ink-soft">{(d[f] || [])[0].deadline}</div>}
            </div>
            <div className="mt-3 space-y-1.5">
              {(d[f] || []).map((it) => (
                <ChecklistRow key={it.id} it={it} isSelf={isSelf} toggle={toggle} edit={edit} onDelete={() => setConfirm(it)} />
              ))}
              {(d[f] || []).length === 0 && <p className="py-2 text-sm text-ink-soft">No items.</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={drafts[f] || ''} onChange={(e) => setDrafts((s) => ({ ...s, [f]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && (drafts[f] || '').trim()) { add.mutate({ frequency: f, text: drafts[f].trim() }); setDrafts((s) => ({ ...s, [f]: '' })); } }}
                placeholder={`Add ${f.toLowerCase()} item…`} className="flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" />
            </div>
          </section>
        ))}
      </div>

      {confirm && (
        <ConfirmModal title="Delete this checklist item?" body={confirm.text}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { del.mutate(confirm.id); setConfirm(null); }} />
      )}
    </div>
  );
}

// One checklist row. Owner can tick; manager sees a read-only status. Both can
// edit the text inline and delete (via the parent's confirm).
function ChecklistRow({ it, isSelf, toggle, edit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(it.text);
  const done = it.checked || it.cleared;
  const mark = it.checked ? '✓' : it.cleared ? '–' : '';
  const dotClass = it.checked ? 'border-sage bg-sage text-white'
    : it.cleared ? 'border-steel bg-steel/20 text-steel'
    : it.overdue ? 'border-brick' : 'border-line';

  const commit = () => { const t = val.trim(); if (t && t !== it.text) edit.mutate({ id: it.id, text: t }); setEditing(false); };

  return (
    <div className="group flex items-center gap-2">
      {isSelf ? (
        <button onClick={() => toggle.mutate(it.id)} title={it.cleared ? 'Cleared by your manager — tick to mark it done yourself' : ''}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${dotClass}`}>{mark}</button>
      ) : (
        <span title="Only this person can tick their own items"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${dotClass} opacity-70`}>{mark}</span>
      )}

      {editing ? (
        <input value={val} autoFocus onChange={(e) => setVal(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(it.text); setEditing(false); } }}
          className="flex-1 rounded border border-line px-2 py-0.5 text-sm outline-none focus:border-pine" />
      ) : (
        <span className={`flex-1 text-sm ${done ? 'text-ink-soft line-through' : it.overdue ? 'text-brick' : ''}`}>{it.text}</span>
      )}

      {it.cleared && <span className={`shrink-0 text-[10px] ${it.clearedBlackMark ? 'text-brick' : 'text-steel'}`}>{it.clearedBlackMark ? 'cleared · delayed' : 'cleared'}</span>}
      {it.overdue && !done && <span className="shrink-0 text-[10px] font-medium text-brick">overdue</span>}
      {!editing && (
        <>
          <button onClick={() => { setVal(it.text); setEditing(true); }} className="shrink-0 text-xs text-ink-soft opacity-0 hover:text-pine group-hover:opacity-100">edit</button>
          <button onClick={onDelete} className="shrink-0 text-xs text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">✕</button>
        </>
      )}
    </div>
  );
}

// 7-day checklist activity, grouped by day. Deleted items can be restored.
function HistoryPanel({ userId, onRestored }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checklist-history', userId], queryFn: () => getChecklistHistory(userId), retry: false });
  const restore = useMutation({ mutationFn: restoreChecklistItem, onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-history', userId] }); onRestored(); } });
  const rows = q.data || [];

  const byDay = {};
  rows.forEach((r) => { const day = new Date(r.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); (byDay[day] ||= []).push(r); });

  const ACTION = {
    added: 'text-sage', edited: 'text-steel', deleted: 'text-brick',
    checked: 'text-sage', unchecked: 'text-ink-soft', cleared: 'text-ochre', restored: 'text-pine',
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Activity · last 7 days</div>
      {rows.length === 0 && <p className="mt-3 text-sm text-ink-soft">No activity in the last 7 days.</p>}
      <div className="mt-3 space-y-3">
        {Object.entries(byDay).map(([day, items]) => (
          <div key={day}>
            <div className="text-[11px] font-semibold text-ink-soft">{day}</div>
            <div className="mt-1 space-y-1">
              {items.map((r) => (
                <div key={r.id} className="flex items-center gap-2 border-b border-line/40 py-1 text-sm last:border-0">
                  <span className={`w-16 shrink-0 text-[11px] font-medium ${ACTION[r.action] || 'text-ink-soft'}`}>{r.action}</span>
                  <span className="flex-1 truncate">{r.text}</span>
                  {r.late && <span className="shrink-0 text-[10px] font-medium text-brick">delayed</span>}
                  <span className="shrink-0 text-[11px] text-ink-soft">{r.actorName ? `${r.actorName} · ` : ''}{new Date(r.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  {r.restorable && <button onClick={() => restore.mutate(r.id)} disabled={restore.isPending} className="shrink-0 text-[11px] font-medium text-pine hover:underline disabled:opacity-50">Restore</button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Small confirmation popup (used for deletes).
function ConfirmModal({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
        {body && <p className="mt-1 text-sm text-ink-soft">“{body}”</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-brick px-4 py-2 text-sm font-medium text-white">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Pending checklists (this period's unchecked items, overdue first) ──
function PendingTab({ userId, isSelf }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['checklist-pending', userId], queryFn: () => getPendingChecklist(userId), retry: false });
  const toggle = useMutation({
    mutationFn: toggleChecklistItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist-pending', userId] }); qc.invalidateQueries({ queryKey: ['checklist', userId] }); },
  });
  const items = q.data || [];
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg font-semibold text-pine">Pending this period</h2>
        <span className="text-xs text-ink-soft">{items.length} pending{overdue ? ` · ${overdue} overdue` : ''}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">All caught up 🎉</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-0">
            {isSelf ? (
              <button onClick={() => toggle.mutate(it.id)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${it.overdue ? 'border-brick' : 'border-line'}`} />
            ) : (
              <span title="Only this person can tick their own items"
                className={`flex h-4 w-4 shrink-0 rounded-full border opacity-70 ${it.overdue ? 'border-brick' : 'border-line'}`} />
            )}
            <span className={`flex-1 text-sm ${it.overdue ? 'text-brick' : ''}`}>{it.text}</span>
            <span className="text-[11px] text-ink-soft">{it.frequency} · {it.deadline || 'no deadline'}</span>
            {it.overdue && <span className="rounded bg-brick/10 px-1.5 py-0.5 text-[10px] font-medium text-brick">overdue</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
