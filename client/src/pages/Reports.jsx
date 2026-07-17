import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { reportsAccess, getOverview } from '../api/reports.api.js';
import { inr } from '../lib/format.js';

const PALETTE = ['#134535', '#2C7A57', '#3F6075', '#9A6312', '#9C3A2A', '#5E635B'];
const STATUS_COLOR = { present: '#2C7A57', late: '#9A6312', half: '#3F6075', absent: '#9C3A2A' };
const STATE_COLOR = { overdue: '#9C3A2A', current: '#134535', upcoming: '#3F6075', undated: '#9A6312', completed: '#2C7A57' };

// `height` overrides the default chart box for charts with one band per row —
// those need room per category or the labels sit on top of each other.
function Card({ title, subtitle, height, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-ink-soft">{subtitle}</span>}
      </div>
      <div className="mt-3 h-64" style={height ? { height } : undefined}>{children}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-lg font-bold tabular-nums sm:text-2xl">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

const axis = { fontSize: 11, fill: '#5E635B' };

// Elide the middle, not the tail: several departments differ only by their
// suffix ("… (Online)" vs "… (Offline)"). Keeping each tick to one line also
// stops labels drifting off the bar they belong to. Tooltip has the full name.
const shortDept = (v) => (v.length > 20 ? `${v.slice(0, 9)}…${v.slice(-9)}` : v);

// Bars are drawn with isAnimationActive={false}: the mount animation
// intermittently never fires and Recharts leaves the rectangles unrendered, so
// the charts come up with axes but no bars. Static bars always paint.

export default function Reports() {
  const access = useQuery({ queryKey: ['reports-access'], queryFn: reportsAccess, retry: false });
  const q = useQuery({ queryKey: ['reports-overview'], queryFn: getOverview, retry: false, enabled: access.data?.canReports });

  if (access.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!access.data?.canReports) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl font-bold text-pine">Reports &amp; Analytics</h1>
        <div className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-ink-soft">Analytics is available to leadership and HR.</div>
      </div>
    );
  }

  const d = q.data;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Reports &amp; Analytics</h1>

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Headcount" value={d.stats.headcount} />
            <Stat label="Departments" value={d.stats.departments} />
            <Stat label="On-time %" value={`${d.stats.avgOnTime}%`} />
            <Stat label="Monthly payroll" value={inr(d.stats.monthlyPayroll)} />
            <Stat label="Open tickets" value={d.stats.openTickets} />
            <Stat label="Pending leave" value={d.stats.pendingLeave} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Headcount by department" height={Math.max(256, d.headcountByDept.length * 22)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.headcountByDept} layout="vertical" margin={{ left: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#DEDBD1" />
                  <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={130} interval={0} tick={axis} axisLine={false} tickLine={false}
                    tickFormatter={shortDept} />
                  <Tooltip cursor={{ fill: '#E4EDE7' }} />
                  <Bar isAnimationActive={false} dataKey="value" radius={[0, 4, 4, 0]}>
                    {d.headcountByDept.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Tier mix">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.tierMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {d.tierMix.map((e, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Attendance" subtitle="this month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.attendance}>
                  <CartesianGrid vertical={false} stroke="#DEDBD1" />
                  <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#E4EDE7' }} />
                  <Bar isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]}>
                    {d.attendance.map((e, i) => <Cell key={i} fill={STATUS_COLOR[e.name] || '#134535'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Leave by type" subtitle="days">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.leaveByType}>
                  <CartesianGrid vertical={false} stroke="#DEDBD1" />
                  <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#E4EDE7' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="approved" stackId="a" fill="#2C7A57" radius={[0, 0, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="pending" stackId="a" fill="#9A6312" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Payroll cost by department" subtitle="monthly gross" height={Math.max(256, d.payrollByDept.length * 22)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.payrollByDept} layout="vertical" margin={{ left: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#DEDBD1" />
                  <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 100000)}L`} />
                  <YAxis type="category" dataKey="name" width={130} interval={0} tick={axis} axisLine={false} tickLine={false}
                    tickFormatter={shortDept} />
                  <Tooltip formatter={(v) => inr(v)} cursor={{ fill: '#E4EDE7' }} />
                  <Bar isAnimationActive={false} dataKey="value" radius={[0, 4, 4, 0]}>
                    {d.payrollByDept.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Event lifecycle">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.eventStates}>
                  <CartesianGrid vertical={false} stroke="#DEDBD1" />
                  <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#E4EDE7' }} />
                  <Bar isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]}>
                    {d.eventStates.map((e, i) => <Cell key={i} fill={STATE_COLOR[e.name] || '#134535'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
