import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { getDashboard } from '../api/dashboard.api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AttentionCard({ value, label, to, accent, subtle }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)}
      className={`rounded-2xl border bg-white p-4 text-left transition hover:border-pine ${accent && value ? 'border-brick/40' : 'border-line'}`}>
      <div className={`text-2xl font-bold tabular-nums ${accent && value ? 'text-brick' : ''}`}>{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
      {subtle && <div className="mt-1 text-[11px] text-pine">{subtle}</div>}
    </button>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard, retry: false });
  const navigate = useNavigate();

  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  const d = q.data;
  if (!d) return <p className="text-brick">Couldn't load your dashboard.</p>;

  const a = d.attention;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-pine">Welcome, {user?.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {user?.designation} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Needs attention */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Needs your attention</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <AttentionCard value={a.myOverdueTasks} label="Overdue tasks" to="/events" accent />
          <AttentionCard value={a.eventsToApprove} label="Events to approve" to="/approvals" accent />
          {a.hasReports && <AttentionCard value={a.leaveToApprove} label="Leave to approve" to="/leave" accent />}
          {a.hasReports && <AttentionCard value={a.expensesToApprove} label="Expenses to approve" to="/expenses" accent />}
          <AttentionCard
            value={a.checkedInToday ? '✓' : '—'}
            label={a.checkedInToday ? `Checked in · ${a.todayStatus}` : 'Not checked in'}
            subtle={a.checkedInToday ? null : 'Check in →'}
            to="/attendance"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* My tasks */}
        <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold">My open tasks</h2>
            <button onClick={() => navigate('/events')} className="text-xs text-pine">View all →</button>
          </div>
          <div className="mt-3 divide-y divide-line/60">
            {d.myTasks.length === 0 && <p className="py-3 text-sm text-ink-soft">You're all caught up. 🎉</p>}
            {d.myTasks.map((t) => (
              <button key={t.taskId} onClick={() => navigate('/events')} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                <span className={`inline-block h-2 w-2 rounded-full ${t.pastDue ? 'bg-brick' : 'bg-steel'}`} />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-xs text-ink-soft">{t.eventName}</span>
                </span>
                {t.pastDue && <span className="rounded bg-brick-tint px-2 py-0.5 text-xs font-medium text-brick">Overdue</span>}
              </button>
            ))}
          </div>
        </section>

        {/* My requests */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-serif text-lg font-semibold">My requests</h2>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Pending leave" value={d.myRequests.pendingLeave} onClick={() => navigate('/leave')} />
            <Row label="Open expense claims" value={d.myRequests.pendingExpenses} onClick={() => navigate('/expenses')} />
            <Row label="Open tickets" value={d.myRequests.openTickets} onClick={() => navigate('/helpdesk')} />
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Leave balance</div>
            <div className="mt-2 flex gap-2">
              {d.myRequests.leaveBalance.map((b) => (
                <div key={b.name} className="flex-1 rounded-lg bg-paper p-2 text-center">
                  <div className="text-lg font-bold">{b.balance}</div>
                  <div className="text-[11px] text-ink-soft">{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Upcoming */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-serif text-lg font-semibold">Upcoming</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Events · next 30 days</div>
            <div className="mt-2 space-y-1.5">
              {d.upcoming.eventsNext30.length === 0 && <p className="text-sm text-ink-soft">Nothing scheduled.</p>}
              {d.upcoming.eventsNext30.map((e) => (
                <button key={e.id} onClick={() => navigate('/events')} className="flex w-full items-center gap-3 text-left text-sm hover:opacity-80">
                  <span className="w-14 shrink-0 font-mono text-xs text-ink-soft">{MONTHS[e.month - 1]} {e.day}</span>
                  <span className="font-medium">{e.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">This month</div>
            <button onClick={() => navigate('/engagement')} className="mt-2 flex items-center gap-2 text-sm hover:opacity-80">
              🎂 <span className="font-medium">{d.upcoming.birthdaysThisMonth}</span> <span className="text-ink-soft">birthdays this month</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between hover:opacity-80">
      <span className="text-ink-soft">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${value ? 'bg-ochre-tint text-ochre' : 'bg-paper text-ink-soft'}`}>{value}</span>
    </button>
  );
}
