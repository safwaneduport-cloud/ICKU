import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccess, getPayslip, getRun, processRun, getCompliance } from '../api/payroll.api.js';
import { inr } from '../lib/format.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date();
const Y = NOW.getFullYear();
const M = NOW.getMonth() + 1;

function Stat({ l, v }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-xs text-ink-soft">{l}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{v}</div>
    </div>
  );
}

export default function Payroll() {
  const access = useQuery({ queryKey: ['pay-access'], queryFn: getAccess, retry: false });
  const admin = access.data?.canPayroll;
  const [tab, setTab] = useState('my');

  const tabs = [['my', 'My Payslip']];
  if (admin) tabs.push(['run', 'Run Payroll'], ['comp', 'Compliance']);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold text-pine">Payroll</h1>
      <div className="flex gap-2">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'my' && <MyPayslip />}
      {tab === 'run' && admin && <RunPayroll />}
      {tab === 'comp' && admin && <Compliance />}
    </div>
  );
}

function BreakupCard({ title, lines, totalLabel, totalAmt }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{l.label}</span><span className="tabular-nums">{inr(l.amt)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
          <span>{totalLabel}</span><span className="tabular-nums">{inr(totalAmt)}</span>
        </div>
      </div>
    </div>
  );
}

function MyPayslip() {
  const q = useQuery({ queryKey: ['pay-slip', Y, M], queryFn: () => getPayslip(Y, M), retry: false });
  const s = q.data;
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!s) return <p className="text-ink-soft">No payslip available.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold">Payslip · {MONTHS[M - 1]} {Y}</h2>
        <p className="text-sm text-ink-soft">{s.user.designation} · CTC {inr(s.ctc)}/yr</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BreakupCard title="Earnings" lines={s.earnings} totalLabel="Gross earnings" totalAmt={s.gross} />
        <BreakupCard title="Deductions" lines={s.deductions} totalLabel="Total deductions" totalAmt={s.dedTotal} />
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-pine p-5 text-white">
        <span className="text-sm">
          Net pay · {MONTHS[M - 1]} {Y}{s.absentDays ? ` · after ${s.absentDays}d LOP` : ''}
        </span>
        <span className="text-2xl font-bold tabular-nums">{inr(s.net)}</span>
      </div>
    </div>
  );
}

function RunPayroll() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pay-run', Y, M], queryFn: () => getRun(Y, M), retry: false });
  const proc = useMutation({ mutationFn: () => processRun(Y, M), onSuccess: () => qc.invalidateQueries() });
  const d = q.data;
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5">
        <div>
          <div className="font-serif text-lg font-semibold">{MONTHS[M - 1]} {Y} · {d.headcount} employees</div>
          <div className="text-sm text-ink-soft">Status: <span className="capitalize">{d.status}</span></div>
        </div>
        {d.status === 'draft' ? (
          <button onClick={() => proc.mutate()} disabled={proc.isPending}
            className="rounded-lg bg-pine px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60">
            {proc.isPending ? 'Processing…' : 'Process payroll'}
          </button>
        ) : (
          <span className="rounded-lg bg-sage-tint px-4 py-2 text-sm font-medium text-sage">Processed ✓</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat l="Gross" v={inr(d.totals.gross)} />
        <Stat l="Deductions" v={inr(d.totals.deductions)} />
        <Stat l="Net payout" v={inr(d.totals.net)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Deductions</th><th className="px-4 py-3">LOP</th><th className="px-4 py-3">Net</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5"><div className="font-medium">{r.name}</div><div className="text-xs text-ink-soft">{r.designation}</div></td>
                <td className="px-4 py-2.5 tabular-nums">{inr(r.gross)}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-soft">{inr(r.deductions)}</td>
                <td className="px-4 py-2.5">{r.lopDays || '—'}</td>
                <td className="px-4 py-2.5 font-medium tabular-nums">{inr(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Compliance() {
  const q = useQuery({ queryKey: ['pay-comp', Y, M], queryFn: () => getCompliance(Y, M), retry: false });
  const d = q.data;
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  const cards = [
    ['Provident Fund (PF)', d.pf],
    ['Professional Tax (PT)', d.pt],
    ['ESI', d.esi],
    ['Income Tax (TDS)', d.tds],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(([l, v]) => (
        <div key={l} className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs text-ink-soft">{l}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{inr(v)}</div>
          <div className="text-[11px] text-ink-soft">{MONTHS[M - 1]} {Y} · {d.headcount} employees</div>
        </div>
      ))}
    </div>
  );
}
