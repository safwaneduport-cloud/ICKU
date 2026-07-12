import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyMonth, getUserMonth } from '../../api/attendance.api.js';
import { STATUS_META, MONTHS, recentMonths } from './statusMeta.js';

function Pill({ status }) {
  const m = STATUS_META[status] || STATUS_META.upcoming;
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.color, background: m.tint }}>
      {m.label}
    </span>
  );
}

function Stat({ v, l }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-2xl font-bold">{v}</div>
      <div className="text-xs text-ink-soft">{l}</div>
    </div>
  );
}

// Reusable month view. Pass userId to view a teammate; omit for the logged-in user.
export default function MonthLogs({ userId }) {
  const opts = recentMonths(6);
  const [sel, setSel] = useState(0);
  const { y, m } = opts[sel];
  const thisYear = new Date().getFullYear();

  const q = useQuery({
    queryKey: ['attendance', userId || 'me', y, m],
    queryFn: () => (userId ? getUserMonth(userId, y, m) : getMyMonth(y, m)),
    retry: false,
  });

  const s = q.data?.summary;
  const logs = (q.data?.days || [])
    .filter((x) => ['present', 'late', 'half', 'absent'].includes(x.status))
    .reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat v={s?.avgHours ?? '—'} l="Avg hrs / day" />
        <Stat v={s ? `${s.onTimePct}%` : '—'} l="On-time arrival" />
        <Stat v={s?.daysWorked ?? '—'} l="Days worked" />
        <Stat v={s?.absent ?? '—'} l="Absent" />
      </div>

      {q.data?.policies && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-white px-3 py-2">
          {[
            ['Weekly Off', q.data.policies.weeklyOffPolicy],
            ['Shift', q.data.policies.shiftPolicy],
            ['Holiday List', q.data.policies.holidayList],
            ['Capture', q.data.policies.attendanceCaptureScheme],
          ].filter(([, v]) => v).map(([label, v]) => (
            <span key={label} className="rounded-lg bg-paper px-2.5 py-1 text-xs">
              <span className="text-ink-soft">{label}: </span><span className="font-medium text-ink">{v}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
        {opts.map((o, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              i === sel ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'
            }`}
          >
            {MONTHS[o.m - 1]}
            {o.y !== thisYear ? ` '${String(o.y).slice(2)}` : ''}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">In</th>
              <th className="px-4 py-3">Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Arrival</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-ink-soft">Loading…</td></tr>
            )}
            {!q.isLoading && logs.map((x) => (
              <tr key={x.date} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{MONTHS[m - 1]} {x.d}</td>
                <td className="px-4 py-2.5">{x.checkIn || '—'}</td>
                <td className="px-4 py-2.5">{x.checkOut || '—'}</td>
                <td className="px-4 py-2.5">{x.hours ? `${x.hours}h` : '—'}</td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {x.status === 'present' ? 'On time' : x.status === 'late' ? 'Late' : '—'}
                </td>
                <td className="px-4 py-2.5"><Pill status={x.status} /></td>
              </tr>
            ))}
            {!q.isLoading && logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                No attendance records for {MONTHS[m - 1]} {y}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
