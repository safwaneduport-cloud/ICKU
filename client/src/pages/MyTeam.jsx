import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { useProfile } from '../store/ProfileContext.jsx';
import { getReports } from '../api/users.api.js';
import { getPendingChecklist, getChecklistDelays, getChecklistBlackMarks, clearAllPending, getDeadlines, setDeadline } from '../api/personal.api.js';
import { getApprovalModes, setApprovalMode, getAssignedTasks } from '../api/events.api.js';
import { dueLabel } from '../features/events/meta.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initials = (name = '') => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// getAssignedTasks returns the project shape flattened onto each task.
const taskDue = (t) => dueLabel({ status: t.eventStatus, triggerMonth: t.triggerMonth, triggerDay: t.triggerDay }, t);

export default function MyTeam() {
  const { user } = useAuth();
  const reportsQ = useQuery({ queryKey: ['my-reports', user?.id], queryFn: () => getReports(user.id), enabled: !!user?.id, retry: false });
  const reports = reportsQ.data || [];
  const [selId, setSelId] = useState(null);
  useEffect(() => { if (!selId && reports.length) setSelId(reports[0].id); }, [reports]); // eslint-disable-line

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

      {/* oval selectors */}
      <div className="flex flex-wrap gap-2">
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

      {selId && <ReportDashboard key={selId} report={reports.find((r) => r.id === selId)} me={user?.id} />}
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
  const overdue = tasks.filter((t) => t.overdue);

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

      {/* Checklist — quick-glance stats, clear-pending, click-through detail */}
      <ChecklistPanel uid={uid} />

      {/* Tasks Pending */}
      <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-semibold text-pine">Tasks pending</h2>
          <span className="text-xs text-ink-soft">{overdue.length} overdue</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {overdue.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">No overdue tasks 🎉</p>}
          {overdue.map((t) => <TaskRow key={t.taskId} t={t} me={me} />)}
        </div>
      </section>

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

// Compact stat tile.
function Tile({ label, value, sub, toneClass = 'text-ink' }) {
  return (
    <div className="rounded-xl border border-line bg-paper/40 p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-[10px] text-ink-soft">{sub}</div>
    </div>
  );
}

// Manager's checklist view for a report: three glanceable tiles (pending,
// black marks / habitual, on-time%), a Clear-pending action with the two-way
// choice, and click-through detail (pending list + recent black marks).
function ChecklistPanel({ uid }) {
  const qc = useQueryClient();
  const pendingQ = useQuery({ queryKey: ['team-pending', uid], queryFn: () => getPendingChecklist(uid), retry: false });
  const delaysQ = useQuery({ queryKey: ['team-delays', uid], queryFn: () => getChecklistDelays(uid), retry: false });
  const marksQ = useQuery({ queryKey: ['team-blackmarks', uid], queryFn: () => getChecklistBlackMarks(uid), retry: false });
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const clear = useMutation({
    mutationFn: (blackMark) => clearAllPending(uid, blackMark),
    onSuccess: () => {
      setMenu(false);
      ['team-pending', 'team-delays', 'team-blackmarks'].forEach((k) => qc.invalidateQueries({ queryKey: [k, uid] }));
    },
  });

  const pending = pendingQ.data || [];
  const delays = delaysQ.data || {};
  const marks = marksQ.data || [];
  const overdue = pending.filter((p) => p.overdue).length;
  const onTime = delays.onTimePct ?? 100;
  const otClass = onTime >= 90 ? 'text-sage' : onTime >= 70 ? 'text-ochre' : 'text-brick';
  const bm = delays.blackMarks ?? 0;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-pine">Checklist</h2>
        <div className="relative">
          <button disabled={!pending.length || clear.isPending} onClick={() => setMenu((v) => !v)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-pine disabled:opacity-50">
            {clear.isPending ? 'Clearing…' : 'Clear pending ▾'}
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              <button onClick={() => clear.mutate(false)} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">
                Excuse <span className="text-ink-soft">— clear, no black mark</span>
              </button>
              <button onClick={() => clear.mutate(true)} className="block w-full border-t border-line px-3 py-2 text-left text-sm hover:bg-paper">
                Clear as black mark <span className="text-brick">— counts against them</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Tile label="Pending" value={pending.length} sub={overdue ? `${overdue} overdue` : 'none overdue'} toneClass={overdue ? 'text-brick' : 'text-ink'} />
        <Tile label="Black marks · 30d" value={bm} sub={delays.habitual ? '⚠ Habitual' : 'last 30 days'} toneClass={delays.habitual ? 'text-brick' : bm ? 'text-ochre' : 'text-ink'} />
        <Tile label="On-time" value={`${onTime}%`} sub={delays.total ? `${delays.total} done` : 'no data'} toneClass={otClass} />
      </div>

      <button onClick={() => setOpen((v) => !v)} className="mt-3 text-sm font-medium text-pine hover:underline">
        {open ? 'Hide details' : 'View details'}
      </button>

      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Pending now · {pending.length}</div>
            <div className="mt-2 space-y-1">
              {pending.length === 0 && <p className="text-sm text-ink-soft">Nothing pending 🎉</p>}
              {pending.map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.overdue ? 'bg-brick' : 'bg-line'}`} />
                  <span className={`flex-1 ${it.overdue ? 'text-brick' : ''}`}>{it.text}</span>
                  <span className="text-[11px] text-ink-soft">{it.frequency}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Recent black marks · {marks.length}</div>
            <div className="mt-2 space-y-1">
              {marks.length === 0 && <p className="text-sm text-ink-soft">None 🎉</p>}
              {marks.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brick" />
                  <span className="flex-1">{m.itemText} <span className="text-ink-soft">· {m.frequency}</span></span>
                  <span className="text-[11px] text-ink-soft">
                    {new Date(m.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{m.byManager ? ' · mgr' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
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
