import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeam, getTeamRegularizations, reviewRegularization } from '../api/attendance.api.js';
import { STATUS_META } from '../features/attendance/statusMeta.js';
import CheckInCard from '../features/attendance/CheckInCard.jsx';
import MonthLogs from '../features/attendance/MonthLogs.jsx';
import RegularizeModal from '../features/attendance/RegularizeModal.jsx';

function TodayDot({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />;
}

export default function Attendance() {
  const [tab, setTab] = useState('me');
  const [drill, setDrill] = useState(null); // { id, name }
  const [showReg, setShowReg] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Attendance</h1>
        <button
          onClick={() => setShowReg(true)}
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm hover:border-pine"
        >
          + Regularize
        </button>
      </div>

      <div className="flex gap-2">
        {[['me', 'Me'], ['team', 'My Team']].map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setTab(t); setDrill(null); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'me' && (
        <div className="space-y-6">
          <CheckInCard />
          <MonthLogs />
        </div>
      )}

      {tab === 'team' && !drill && <TeamView onOpen={setDrill} />}

      {tab === 'team' && drill && (
        <div className="space-y-4">
          <button onClick={() => setDrill(null)} className="text-sm font-medium text-pine">← All team</button>
          <h2 className="font-serif text-2xl font-bold">{drill.name}</h2>
          <MonthLogs userId={drill.id} />
        </div>
      )}

      {showReg && <RegularizeModal onClose={() => setShowReg(false)} />}
    </div>
  );
}

function TeamView({ onOpen }) {
  const now = new Date();
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ['att-team'],
    queryFn: () => getTeam(now.getFullYear(), now.getMonth() + 1),
    retry: false,
  });
  const regs = useQuery({ queryKey: ['att-team-regs'], queryFn: getTeamRegularizations, retry: false });
  const review = useMutation({
    mutationFn: ({ id, decision }) => reviewRegularization(id, decision),
    onSuccess: () => qc.invalidateQueries(),
  });

  const pending = (regs.data || []).filter((r) => r.status === 'pending');

  if (team.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!team.data?.length) return <p className="text-ink-soft">You have no direct reports.</p>;

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="font-serif text-lg font-semibold">
            Regularizations to review <span className="text-ink-soft">({pending.length})</span>
          </h3>
          <div className="mt-3 space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <div><strong>{r.user.name}</strong> · {r.date} · <span className="text-ink-soft">{r.reason}</span></div>
                <div className="flex gap-2">
                  <button
                    onClick={() => review.mutate({ id: r.id, decision: 'reject' })}
                    className="rounded border border-line px-2.5 py-1 text-xs hover:border-brick hover:text-brick"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => review.mutate({ id: r.id, decision: 'approve' })}
                    className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {team.data.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen({ id: r.id, name: r.name })}
            className="rounded-2xl border border-line bg-white p-4 text-left hover:border-pine"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-1.5 text-xs capitalize text-ink-soft">
                <TodayDot status={r.today} /> {r.today}
              </div>
            </div>
            <div className="mt-1 text-xs text-ink-soft">{r.designation}</div>
            <div className="mt-3 flex gap-4 text-xs text-ink-soft">
              <span><strong className="text-ink">{r.summary.daysWorked}</strong> days</span>
              <span><strong className="text-ink">{r.summary.avgHours}</strong> avg hrs</span>
              <span><strong className="text-ink">{r.summary.onTimePct}%</strong> on-time</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
