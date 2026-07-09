import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToday, checkIn, checkOut } from '../../api/attendance.api.js';

export default function CheckInCard() {
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['att-today'], queryFn: getToday, retry: false });
  const rec = today.data?.record;

  const invalidate = () => qc.invalidateQueries();
  const inMut = useMutation({ mutationFn: checkIn, onSuccess: invalidate });
  const outMut = useMutation({ mutationFn: checkOut, onSuccess: invalidate });

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const err = inMut.error || outMut.error;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serif text-4xl font-bold tabular-nums">{time}</div>
          <div className="text-sm text-ink-soft">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div>
          {!rec?.checkIn && (
            <button
              onClick={() => inMut.mutate()}
              disabled={inMut.isPending}
              className="rounded-lg bg-pine px-6 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {inMut.isPending ? 'Checking in…' : 'Web check-in'}
            </button>
          )}
          {rec?.checkIn && !rec?.checkOut && (
            <button
              onClick={() => outMut.mutate()}
              disabled={outMut.isPending}
              className="rounded-lg bg-brick px-6 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {outMut.isPending ? 'Checking out…' : 'Check-out'}
            </button>
          )}
          {rec?.checkIn && rec?.checkOut && (
            <span className="rounded-lg bg-sage-tint px-4 py-2 text-sm font-medium text-sage">Done for today ✓</span>
          )}
        </div>
      </div>

      {rec?.checkIn && (
        <div className="mt-4 text-sm text-ink-soft">
          In <strong className="text-ink">{rec.checkIn}</strong>
          {rec.checkOut && <> · Out <strong className="text-ink">{rec.checkOut}</strong> · {rec.hours}h</>}
          {' · '}<span className="capitalize">{rec.status}</span>
        </div>
      )}
      {err && (
        <div className="mt-3 rounded-lg bg-brick-tint px-3 py-2 text-sm text-brick">
          {err.response?.data?.error?.message || 'Something went wrong'}
        </div>
      )}
    </div>
  );
}
