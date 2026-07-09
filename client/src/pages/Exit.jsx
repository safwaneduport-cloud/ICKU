import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exitMeta, getMyExit, getTeamExits, submitExit, withdrawExit, toggleClearance, setInterview } from '../api/lifecycle.api.js';
import { inr } from '../lib/format.js';

export default function Exit() {
  const meta = useQuery({ queryKey: ['exit-meta'], queryFn: exitMeta, retry: false });
  const [tab, setTab] = useState('me');
  const showTeam = meta.data?.isAdmin ?? true; // managers/admins get the team tab

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Exit</h1>
      <div className="flex gap-2">
        {[['me', 'My Resignation'], ...(showTeam ? [['team', 'My Team']] : [])].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'me' ? <MyExit steps={meta.data?.clearanceSteps || []} /> : <TeamExits steps={meta.data?.clearanceSteps || []} />}
    </div>
  );
}

function Money({ label, amount, negative }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="tabular-nums">{negative ? '−' : ''}{inr(amount)}</span>
    </div>
  );
}

function Fnf({ fnf }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Full &amp; final settlement</div>
      <div className="mt-3 space-y-2">
        <Money label="Final salary (pro-rated)" amount={fnf.finalSalary} />
        <Money label={`Leave encashment · ${fnf.earnedBal}d`} amount={fnf.encash} />
        <Money label="Gratuity" amount={fnf.gratuity} />
        <Money label="Recovery" amount={fnf.recovery} negative />
        <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
          <span>Net F&amp;F payable</span><span className="tabular-nums">{inr(fnf.net)}</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="rounded-lg border border-line px-3 py-1.5 text-xs" title="Prototype">↓ Experience letter</button>
        <button className="rounded-lg border border-line px-3 py-1.5 text-xs" title="Prototype">↓ Relieving letter</button>
      </div>
    </div>
  );
}

function Clearance({ e, steps, editable }) {
  const qc = useQueryClient();
  const toggle = useMutation({ mutationFn: ({ id, step }) => toggleClearance(id, step), onSuccess: () => qc.invalidateQueries() });
  const interview = useMutation({ mutationFn: ({ id, value }) => setInterview(id, value), onSuccess: () => qc.invalidateQueries() });

  const rows = [...steps.map((s) => ({ label: `${s} clearance`, done: e.clearance.includes(s), onToggle: () => toggle.mutate({ id: e.id, step: s }) })),
    { label: 'Exit interview', done: e.exitInterview, onToggle: () => interview.mutate({ id: e.id, value: !e.exitInterview }) }];

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Clearance workflow · {e.clearedPct}%</div>
      <div className="mt-3 space-y-1">
        {rows.map((r) => (
          <button key={r.label} onClick={editable ? r.onToggle : undefined} disabled={!editable}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${editable ? 'hover:bg-paper' : 'cursor-default'}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${r.done ? 'border-sage bg-sage text-white' : 'border-line'}`}>{r.done ? '✓' : ''}</span>
            <span className={r.done ? 'text-ink-soft line-through' : ''}>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExitCard({ e, steps, editable, self }) {
  const qc = useQueryClient();
  const withdraw = useMutation({ mutationFn: () => withdrawExit(e.id), onSuccess: () => qc.invalidateQueries() });
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-serif text-lg font-semibold">{self ? 'My resignation' : e.user.name}</div>
        <span className="rounded bg-ochre-tint px-2 py-0.5 text-xs font-medium text-ochre">Notice · {e.clearedPct}% cleared</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-soft">
        <span>Last day · {e.lastDay}</span>
        <span>{e.noticeDays} days notice left</span>
        <span>{e.reason}</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Clearance e={e} steps={steps} editable={editable} />
        <Fnf fnf={e.fnf} />
      </div>
      {self && <button onClick={() => withdraw.mutate()} className="mt-3 text-sm text-ink-soft hover:text-brick">Withdraw resignation</button>}
    </div>
  );
}

function MyExit({ steps }) {
  const q = useQuery({ queryKey: ['exit-me'], queryFn: getMyExit, retry: false });
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (q.data) return <ExitCard e={q.data} steps={steps} editable={false} self />;
  return <ResignForm />;
}

function ResignForm() {
  const qc = useQueryClient();
  const [lastDay, setLastDay] = useState('');
  const [reason, setReason] = useState('');
  const mut = useMutation({ mutationFn: () => submitExit({ lastDay, reason: reason.trim() }), onSuccess: () => qc.invalidateQueries() });
  return (
    <div className="max-w-md rounded-2xl border border-line bg-white p-5">
      <div className="font-serif text-lg font-semibold">Submit resignation</div>
      <p className="mt-1 text-sm text-ink-soft">This starts your notice period and clearance workflow.</p>
      <label className="mt-4 block text-sm"><span className="text-ink-soft">Last working day</span>
        <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
      </label>
      <label className="mt-3 block text-sm"><span className="text-ink-soft">Reason</span>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Reason for leaving" />
      </label>
      {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
      <button onClick={() => mut.mutate()} disabled={!lastDay || !reason.trim() || mut.isPending} className="mt-4 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {mut.isPending ? 'Submitting…' : 'Submit resignation'}
      </button>
    </div>
  );
}

function TeamExits({ steps }) {
  const q = useQuery({ queryKey: ['exit-team'], queryFn: getTeamExits, retry: false });
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  const rows = q.data || [];
  if (!rows.length) return <p className="text-ink-soft">No active resignations in your team.</p>;
  return <div className="space-y-4">{rows.map((e) => <ExitCard key={e.id} e={e} steps={steps} editable />)}</div>;
}
