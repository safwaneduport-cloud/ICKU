import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBalances, getMyRequests, cancelRequest, getTeam, reviewRequest } from '../api/leave.api.js';
import { getMyProfile } from '../api/employees.api.js';
import ApplyLeaveModal from '../features/leave/ApplyLeaveModal.jsx';

const STATUS = {
  approved: { color: '#2C7A57', tint: '#E2EFE7' },
  pending: { color: '#9A6312', tint: '#F5EAD4' },
  rejected: { color: '#9C3A2A', tint: '#F3E1DC' },
  cancelled: { color: '#5E635B', tint: '#F1EFE8' },
};

function Pill({ status }) {
  const m = STATUS[status] || STATUS.pending;
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium capitalize" style={{ color: m.color, background: m.tint }}>
      {status}
    </span>
  );
}

const fmt = (from, to) => (from === to ? from : `${from} → ${to}`);

export default function Leave() {
  const [tab, setTab] = useState('me');
  const [showApply, setShowApply] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Leave</h1>
        <button onClick={() => setShowApply(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Apply leave
        </button>
      </div>

      <div className="flex gap-2">
        {[['me', 'Me'], ['team', 'My Team']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'me' ? <MeView /> : <TeamView />}
      {showApply && <ApplyLeaveModal onClose={() => setShowApply(false)} />}
    </div>
  );
}

function MeView() {
  const qc = useQueryClient();
  const balances = useQuery({ queryKey: ['leave-balances'], queryFn: () => getBalances(), retry: false });
  const requests = useQuery({ queryKey: ['leave-requests'], queryFn: getMyRequests, retry: false });
  const profile = useQuery({ queryKey: ['profile-edit', 'me'], queryFn: getMyProfile, retry: false });
  const cancel = useMutation({ mutationFn: cancelRequest, onSuccess: () => qc.invalidateQueries() });

  const pol = profile.data?.user;
  return (
    <div className="space-y-6">
      {pol && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-white px-3 py-2">
          {[['Leave Plan', pol.leavePlan], ['Holiday List', pol.holidayList], ['Notice Period', pol.noticePeriod]]
            .filter(([, v]) => v).map(([label, v]) => (
              <span key={label} className="rounded-lg bg-paper px-2.5 py-1 text-xs">
                <span className="text-ink-soft">{label}: </span><span className="font-medium text-ink">{v}</span>
              </span>
            ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(balances.data || []).map((b) => (
          <div key={b.id} className="rounded-2xl border border-line bg-white p-4">
            <div className="h-1 w-8 rounded-full" style={{ background: b.color }} />
            <div className="mt-2 text-2xl font-bold">{b.balance}</div>
            <div className="text-xs font-medium">{b.name}</div>
            <div className="mt-1 text-[11px] text-ink-soft">{b.used} used / {b.total}{b.pending ? ` · ${b.pending} pending` : ''}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th><th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {requests.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-ink-soft">Loading…</td></tr>}
            {(requests.data || []).map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.type.name}</td>
                <td className="px-4 py-2.5">{fmt(r.fromDate, r.toDate)}{r.half ? ' (½)' : ''}</td>
                <td className="px-4 py-2.5">{r.days}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.reason}</td>
                <td className="px-4 py-2.5"><Pill status={r.status} /></td>
                <td className="px-4 py-2.5">
                  {r.status === 'pending' && (
                    <button onClick={() => cancel.mutate(r.id)} className="text-xs text-ink-soft hover:text-brick">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
            {!requests.isLoading && (requests.data || []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">No leave requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamView() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ['leave-team'], queryFn: getTeam, retry: false });
  const review = useMutation({
    mutationFn: ({ id, decision }) => reviewRequest(id, decision),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (team.isLoading) return <p className="text-ink-soft">Loading…</p>;
  const all = team.data || [];
  if (!all.length) return <p className="text-ink-soft">No leave requests from your team.</p>;
  const pending = all.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="font-serif text-lg font-semibold">Pending approvals <span className="text-ink-soft">({pending.length})</span></h3>
          <div className="mt-3 space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <div>
                  <strong>{r.user.name}</strong> · {r.type.name} · {fmt(r.fromDate, r.toDate)}
                  <span className="text-ink-soft"> · {r.days}d · {r.reason}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => review.mutate({ id: r.id, decision: 'reject' })}
                    className="rounded border border-line px-2.5 py-1 text-xs hover:border-brick hover:text-brick">Reject</button>
                  <button onClick={() => review.mutate({ id: r.id, decision: 'approve' })}
                    className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white">Approve</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.user.name}</td>
                <td className="px-4 py-2.5">{r.type.name}</td>
                <td className="px-4 py-2.5">{fmt(r.fromDate, r.toDate)}</td>
                <td className="px-4 py-2.5">{r.days}</td>
                <td className="px-4 py-2.5"><Pill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
