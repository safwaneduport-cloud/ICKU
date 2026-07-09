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

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-ink-soft">{subtitle}</span>}
      </div>
      <div className="mt-3 h-64">{children}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

const axis = { fontSize: 11, fill: '#5E635B' };

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
            <Card title="Headcount by department">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.headcountByDept} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#DEDBD1" />
                  <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#E4EDE7' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
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
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
                  <Bar dataKey="approved" stackId="a" fill="#2C7A57" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" stackId="a" fill="#9A6312" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Payroll cost by department" subtitle="monthly gross">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.payrollByDept} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#DEDBD1" />
                  <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 100000)}L`} />
                  <YAxis type="category" dataKey="name" width={90} tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => inr(v)} cursor={{ fill: '#E4EDE7' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
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
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
