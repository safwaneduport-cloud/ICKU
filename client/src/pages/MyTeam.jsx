import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { useProfile } from '../store/ProfileContext.jsx';
import { getReports } from '../api/users.api.js';
import { getPendingChecklist, getChecklistMonthStats, clearAllPending, getDeadlines, setDeadline } from '../api/personal.api.js';
import { getApprovalModes, setApprovalMode, getAssignedTasks, getTaskMonthStats, getTaskPending } from '../api/events.api.js';
import { dueLabel } from '../features/events/meta.js';
import StatPanel from '../features/team/StatPanel.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// getAssignedTasks returns the project shape flattened onto each task.
const taskDue = (t) => dueLabel({ status: t.eventStatus, triggerMonth: t.triggerMonth, triggerDay: t.triggerDay }, t);

export default function MyTeam() {
  const { user } = useAuth();
  const reportsQ = useQuery({ queryKey: ['my-reports', user?.id], queryFn: () => getReports(user.id), enabled: !!user?.id, retry: false });
  const reports = reportsQ.data || [];
  const [selId, setSelId] = useState('all'); // 'all' (team overview) | a report id

  if (reportsQ.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!reports.length) return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-bold text-pine">My Team</h1>
      <div className="rounded-2xl border border-line bg-white px-4 py-10 text-center text-ink-soft">You have no direct reports.</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-pine">My Team</h1>
        <p className="text-sm text-ink-soft">Your direct reports — their pending checklists, tasks, and approval settings.</p>
      </div>

      {/* oval selectors — "All" first for a team-wide overview */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelId('all')}
          className={`flex items-center gap-2 rounded-full border py-1 pl-2.5 pr-3 text-sm font-medium ${selId === 'all' ? 'border-pine bg-pine text-white' : 'border-line bg-white text-ink hover:border-pine'}`}>
          👥 All
        </button>
        {reports.map((r) => {
          const on = r.id === selId;
          return (
            <button key={r.id} onClick={() => setSelId(r.id)}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? 'border-pine bg-pine text-white' : 'border-line bg-white text-ink hover:border-pine'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${on ? 'bg-white/20' : 'bg-pine-tint text-pine'}`}>{initials(r.name)}</span>
              {r.name}
            </button>
          );
        })}
      </div>

      {selId === 'all'
        ? <AllTeamOverview reports={reports} onPick={setSelId} />
        : <ReportDashboard key={selId} report={reports.find((r) => r.id === selId)} me={user?.id} />}
    </div>
  );
}

// Team-wide overview (the "All" tab): one row per report with their pending
// checklist + task counts, overdue in red. Click a row to drill into that person.
// Deliberately omits per-person controls (deadlines, auto-approval) — those only
// make sense when a specific employee is selected.
function AllTeamOverview({ reports, onPick }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="hidden items-center border-b border-line bg-paper/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft sm:flex">
        <span className="flex-1">Employee</span><span className="w-20 text-center sm:w-24">Checklists</span><span className="w-20 text-center sm:w-24">Tasks</span>
      </div>
      {reports.map((r) => <TeamRow key={r.id} report={r} onPick={onPick} />)}
    </section>
  );
}

function TeamRow({ report, onPick }) {
  const cl = useQuery({ queryKey: ['team-pending', report.id], queryFn: () => getPendingChecklist(report.id), retry: false });
  const tk = useQuery({ queryKey: ['team-tasks', report.id], queryFn: () => getAssignedTasks(report.id), retry: false });
  const clRows = cl.data || [];
  const tasks = tk.data || [];
  const clPending = clRows.length;
  const clOverdue = clRows.filter((x) => x.overdue).length;
  const tkPending = tasks.filter((t) => !t.completed && t.status !== 'rejected').length;
  const tkOverdue = tasks.filter((t) => t.overdue && !t.completed).length;
  const loading = cl.isLoading || tk.isLoading;
  return (
    <button onClick={() => onPick(report.id)} className="flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-3 text-left last:border-0 hover:bg-paper sm:gap-3 sm:px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine-tint text-[11px] font-semibold text-pine">{initials(report.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{report.name}</div>
        <div className="truncate text-xs text-ink-soft">{report.designation}</div>
      </div>
      {loading ? <span className="text-xs text-ink-soft">…</span> : (
        <>
          <Count value={clPending} overdue={clOverdue} label="pending" />
          <Count value={tkPending} overdue={tkOverdue} label="pending" />
        </>
      )}
    </button>
  );
}

function Count({ value, overdue, label }) {
  return (
    <div className="w-20 shrink-0 text-center sm:w-24">
      <div className={`text-lg font-bold leading-none ${overdue ? 'text-brick' : value ? 'text-ink' : 'text-ink-soft'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-ink-soft">{overdue ? <span className="font-medium text-brick">{overdue} overdue</span> : label}</div>
    </div>
  );
}

function ReportDashboard({ report, me }) {
  const uid = report.id;
  const { openProfile } = useProfile();
  const tasksQ = useQuery({ queryKey: ['team-tasks', uid], queryFn: () => getAssignedTasks(uid), retry: false });

  const tasks = tasksQ.data || [];
  const byMe = tasks.filter((t) => t.ownerId === me);
  const byOthers = tasks.filter((t) => t.ownerId !== me);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Header + manager settings */}
      <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => openProfile(uid)} className="text-left">
            <div className="font-serif text-lg font-semibold text-pine hover:underline">{report.name}</div>
            <div className="text-sm text-ink-soft">{report.designation} · {report.employeeNumber || uid}</div>
          </button>
          <ApprovalToggle uid={uid} name={report.name} />
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Checklist deadlines</div>
          <DeadlineEditor uid={uid} />
        </div>
      </section>

      {/* Checklist + Tasks: clickable Pending / Delayed / On-time cards, monthly. */}
      <ChecklistStat uid={uid} />
      <TaskStat uid={uid} />

      {/* All tasks, split by who assigned */}
      <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-semibold text-pine">Tasks</h2>
          <span className="text-xs text-ink-soft">{tasks.length} total</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TaskColumn title="Assigned by me" tasks={byMe} me={me} empty="Nothing you assigned." />
          <TaskColumn title="Assigned by others" tasks={byOthers} me={me} empty="Nothing from others." />
        </div>
      </section>
    </div>
  );
}

function TaskColumn({ title, tasks, me, empty }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title} · {tasks.length}</div>
      <div className="space-y-1.5">
        {tasks.length === 0 && <p className="text-sm text-ink-soft">{empty}</p>}
        {tasks.map((t) => <TaskRow key={t.taskId} t={t} me={me} showOwner={t.ownerId !== me} />)}
      </div>
    </div>
  );
}

function TaskRow({ t, showOwner }) {
  const due = taskDue(t);
  return (
    <div className="flex items-center gap-2 border-b border-line/60 py-1 text-sm last:border-0">
      <input type="checkbox" checked={t.completed} disabled className="shrink-0" />
      <span className={`flex-1 ${t.completed ? 'text-ink-soft line-through' : t.overdue ? 'text-brick' : ''}`}>
        {t.name} <span className="text-ink-soft">· {t.projectName}</span>
      </span>
      {showOwner && <span className="text-[11px] text-ink-soft">by {t.ownerName}</span>}
      {due && <span className="text-[11px] text-ink-soft">due {due}</span>}
      {t.approval === 'pending' && <span className="rounded bg-ochre-tint px-1.5 text-[10px] text-ochre">awaiting approval</span>}
      {t.status === 'rejected' && <span className="rounded bg-brick/10 px-1.5 text-[10px] text-brick">rejected</span>}
      {t.overdue && <span className="rounded bg-brick/10 px-1.5 text-[10px] font-medium text-brick">overdue</span>}
    </div>
  );
}

// A report's Checklist stats panel (StatPanel): clickable Pending / Delayed /
// On-time cards with a month selector, plus the manager's two-way Clear-pending.
function ChecklistStat({ uid }) {
  const qc = useQueryClient();
  const clear = useMutation({
    mutationFn: (blackMark) => clearAllPending(uid, blackMark),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-cl', uid] }),
  });
  return (
    <StatPanel
      title="Checklist"
      qkey={['team-cl', uid]}
      pending={() => getPendingChecklist(uid).then((rows) => rows.map((it) => ({ key: it.id, label: it.text, meta: it.frequency, overdue: it.overdue })))}
      month={(y, m) => getChecklistMonthStats(uid, y, m).then((s) => ({
        ...s,
        completions: (s.completions || []).map((c, i) => ({ key: `${c.completedAt}-${i}`, label: c.itemText, meta: c.frequency, completedAt: c.completedAt, dueAt: c.dueAt, late: c.late, byManager: c.byManager })),
      }))}
      onClear={(bm) => clear.mutate(bm)}
      clearBusy={clear.isPending}
    />
  );
}

// A report's Tasks stats panel — same shape, over project + ad-hoc tasks.
function TaskStat({ uid }) {
  return (
    <StatPanel
      title="Tasks"
      qkey={['team-tk', uid]}
      pending={() => getTaskPending(uid).then((rows) => rows.map((t, i) => ({ key: `${i}-${t.name}`, label: t.name, meta: t.source === 'project' ? t.project : 'ad-hoc task', overdue: t.overdue })))}
      month={(y, m) => getTaskMonthStats(uid, y, m).then((s) => ({
        ...s,
        completions: (s.completions || []).map((c, i) => ({ key: `${c.completedAt}-${i}`, label: c.name, meta: c.source === 'project' ? c.project : 'ad-hoc task', completedAt: c.completedAt, dueAt: c.dueAt, late: c.late, byManager: false })),
      }))}
    />
  );
}

// Auto/manual approval toggles for this report's created projects AND tasks.
function ApprovalToggle({ uid }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['approval-modes'], queryFn: getApprovalModes, retry: false });
  const mode = (q.data || []).find((r) => r.id === uid);
  const mut = useMutation({
    mutationFn: (patch) => setApprovalMode(uid, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-modes'] }),
  });
  const Row = ({ label, field }) => {
    const auto = mode?.[field] !== false;
    return (
      <label className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">{label}:</span>
        <button onClick={() => mut.mutate({ [field]: !auto })} disabled={mut.isPending}
          className={`rounded-full px-3 py-1 text-xs font-medium ${auto ? 'bg-pine text-white' : 'border border-line text-ink-soft'}`}>
          {auto ? 'Auto-approve' : 'Needs my approval'}
        </button>
      </label>
    );
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Row label="Projects they create" field="autoApproveProjects" />
      <Row label="Tasks assigned to them" field="autoApproveTasks" />
      <p className="text-[10px] text-ink-soft">Off = it waits for your approval before going live.</p>
    </div>
  );
}

// Compact per-frequency deadline editor.
function DeadlineEditor({ uid }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['team-deadlines', uid], queryFn: () => getDeadlines(uid), retry: false });
  const save = useMutation({
    mutationFn: ({ freq, cfg }) => setDeadline(uid, freq, cfg),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team-deadlines', uid] }); qc.invalidateQueries({ queryKey: ['team-pending', uid] }); },
  });
  const rows = q.data || [];
  return (
    <div className="mt-2 space-y-2">
      {rows.map((r) => (
        <div key={r.frequency} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-16 text-ink-soft">{r.frequency}</span>
          {r.frequency === 'Weekly' && (
            <select value={r.weekday ?? 5} onChange={(e) => save.mutate({ freq: r.frequency, cfg: { time: r.time, weekday: +e.target.value } })}
              className="rounded-lg border border-line px-2 py-1 text-xs">
              {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}
          {r.frequency === 'Monthly' && (
            <input type="number" min={1} max={31} value={r.dayOfMonth ?? 31}
              onChange={(e) => save.mutate({ freq: r.frequency, cfg: { time: r.time, dayOfMonth: +e.target.value } })}
              className="w-16 rounded-lg border border-line px-2 py-1 text-xs" />
          )}
          <input type="time" value={r.time} onChange={(e) => save.mutate({ freq: r.frequency, cfg: { time: e.target.value, weekday: r.weekday, dayOfMonth: r.dayOfMonth } })}
            className="rounded-lg border border-line px-2 py-1 text-xs" />
          {!r.configured && <span className="text-[10px] text-ink-soft">(default)</span>}
        </div>
      ))}
    </div>
  );
}
