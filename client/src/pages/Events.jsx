import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents, getTaskList, deleteEvent, toggleTask } from '../api/events.api.js';
import { getMyTasks, getTasksIAssigned, toggleDirectTask, rejectDirectAssignment, deleteDirectTask, addDirectAssignees, removeDirectAssignee } from '../api/directTasks.api.js';
import ReassignControl from '../features/tasks/ReassignControl.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { STATE, triggerLabel, dueLabel, taskDueDate, MONTHS, ymd } from '../features/events/meta.js';
import EventDrawer from '../features/events/EventDrawer.jsx';
import NewEventModal from '../features/events/NewEventModal.jsx';
import AssignTaskModal from '../features/tasks/AssignTaskModal.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isCeoAdmin = (u) => u?.id === 'ceo' || u?.id === 'EP002' || u?.role === 'HR Head';

// The status colour is the primary signal on every card — so this badge is bold.
function StatusBadge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}

// Filter chips — the order people asked for: what needs attention first, All last.
// Undated only applies to projects (every task lands on a date or is "current").
const TASK_FILTERS = [['overdue', 'Overdue'], ['current', 'Current'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['all', 'All']];
const PROJ_FILTERS = [['overdue', 'Overdue'], ['current', 'Current'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['undated', 'Undated'], ['all', 'All']];

const countByState = (list) => {
  const c = { overdue: 0, current: 0, upcoming: 0, completed: 0, undated: 0, all: list.length };
  for (const x of list) if (c[x.state] !== undefined) c[x.state] += 1;
  return c;
};

// Absolute due for a flat project-task row (from the Tasks-view backend shape).
const projTaskDue = (t) => taskDueDate({ status: t.eventStatus, triggerMonth: t.triggerMonth, triggerDay: t.triggerDay }, t);
const projTaskDueText = (t) => dueLabel({ status: t.eventStatus, triggerMonth: t.triggerMonth, triggerDay: t.triggerDay }, t);
// Absolute due for an ad-hoc (direct) task — its dueDate is already absolute.
const directDueDate = (t) => (t.dueDate ? (() => { const d = new Date(`${t.dueDate}T${t.dueTime || '00:00'}:00`); return isNaN(d) ? null : d; })() : null);
const directDueText = (t) => {
  const d = directDueDate(t);
  if (!d) return '';
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return t.dueTime ? `${date}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : date;
};

// A thin vertical bar showing a project's task completion (fills from the bottom).
function CompletionBar({ done = 0, total = 0 }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex w-1.5 shrink-0 flex-col justify-end self-stretch overflow-hidden bg-line/40" title={`${done}/${total} tasks done`}>
      <div className="w-full bg-sage" style={{ height: `${pct}%` }} />
    </div>
  );
}

// One shape for every task — project or ad-hoc — so the Tasks list and Calendar
// treat them uniformly. `toMe` = assigned to me; `byMe` = I own it / I assigned it.
function projectRow(t, userId) {
  const dueAt = projTaskDue(t);
  return {
    key: `p${t.taskId}`, kind: 'project', id: t.taskId, projectId: t.projectId, title: t.name, description: t.description || '',
    projectName: t.projectName, ownerName: t.ownerName, assignees: t.assignees || [],
    completed: t.completed, overdue: t.overdue, state: t.state, dueAt, dueText: projTaskDueText(t),
    toMe: !!t.mine, byMe: t.ownerId === userId,
  };
}
// "View details" for a task card — reveals the (optional) description on demand.
function TaskDetailsToggle({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-medium text-pine hover:underline">
        {open ? 'Hide details' : 'View details'}
      </button>
      {open && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-line bg-paper/40 px-2.5 py-1.5 text-xs text-ink-soft">{text}</p>}
    </div>
  );
}
function directRow(t, { toMe, byMe }) {
  const now = new Date();
  const dueAt = directDueDate(t);
  const overdue = !t.completed && !!dueAt && dueAt < now;
  const state = t.completed ? 'completed' : overdue ? 'overdue' : !dueAt ? 'current' : dueAt <= now ? 'current' : 'upcoming';
  return {
    key: `d${t.id}`, kind: 'direct', id: t.id, title: t.title, description: t.description || '',
    projectName: 'Direct task', by: t.assignerName, assignees: t.assignees || [],
    completed: t.completed, overdue, state, dueAt, dueText: directDueText(t),
    toMe, byMe, raw: t,
  };
}

export default function Events() {
  const { user } = useAuth();
  const [view, setView] = useState('projects'); // 'projects' | 'tasks'
  const [taskView, setTaskView] = useState('list'); // 'list' | 'calendar' — inside Tasks
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState('me'); // 'me' | 'by' | 'all' — Tasks
  const [projScope, setProjScope] = useState('mine'); // 'mine' | 'all' — Projects
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  // Undated only exists for projects — don't leave it stuck when moving to Tasks.
  useEffect(() => { if (view === 'tasks' && filter === 'undated') setFilter('all'); }, [view]); // eslint-disable-line

  const qc = useQueryClient();
  // Fetch the full set (no server-side state filter) so we can show per-filter counts.
  const projectsQ = useQuery({ queryKey: ['events', 'all', projScope], queryFn: () => getEvents('all', projScope === 'mine'), retry: false, enabled: view === 'projects' });
  const projTasksQ = useQuery({ queryKey: ['task-list', 'all', false], queryFn: () => getTaskList('all', false), retry: false, enabled: view === 'tasks' });
  const myDirectQ = useQuery({ queryKey: ['direct-tasks-mine'], queryFn: getMyTasks, retry: false, enabled: view === 'tasks' });
  const iAssignedQ = useQuery({ queryKey: ['direct-tasks-assigned'], queryFn: getTasksIAssigned, retry: false, enabled: view === 'tasks' });

  const invalidateTasks = () => {
    qc.invalidateQueries({ queryKey: ['task-list'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-mine'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-assigned'] });
    qc.invalidateQueries({ queryKey: ['events'] });
  };

  // Unified rows for the active scope (To me / By me / All), all states.
  const rows = useMemo(() => {
    const uid = user?.id;
    const soleMe = (as = []) => as.length > 0 && as.every((a) => a.id === uid);
    const pt = (projTasksQ.data || []);
    const mine = (myDirectQ.data || []).filter((t) => (t.assignees?.find((a) => a.id === uid) || {}).status !== 'rejected');
    const assigned = (iAssignedQ.data || []);
    const isByMeProj = (t) => t.ownerId === uid && !soleMe(t.assignees);
    if (scope === 'me') {
      return [...pt.filter((t) => t.mine).map((t) => projectRow(t, uid)), ...mine.map((t) => directRow(t, { toMe: true, byMe: false }))];
    }
    if (scope === 'by') {
      return [...pt.filter(isByMeProj).map((t) => projectRow(t, uid)), ...assigned.filter((t) => !soleMe(t.assignees)).map((t) => directRow(t, { toMe: false, byMe: true }))];
    }
    const projRows = pt.filter((t) => t.mine || isByMeProj(t)).map((t) => projectRow(t, uid));
    const seen = new Set();
    const direct = [];
    for (const t of mine) { seen.add(t.id); direct.push(directRow(t, { toMe: true, byMe: false })); }
    for (const t of assigned) if (!seen.has(t.id) && !soleMe(t.assignees)) direct.push(directRow(t, { toMe: false, byMe: true }));
    return [...projRows, ...direct];
  }, [projTasksQ.data, myDirectQ.data, iAssignedQ.data, scope, user?.id]);

  const order = { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 };
  const sortedRows = useMemo(() => [...rows].sort((a, b) => (order[a.state] - order[b.state]) || ((a.dueAt?.getTime() || Infinity) - (b.dueAt?.getTime() || Infinity)) || a.title.localeCompare(b.title)), [rows]);

  const projects = projectsQ.data || [];
  // Per-filter counts + the state-filtered view of the current dataset.
  const counts = view === 'projects' ? countByState(projects) : countByState(rows);
  const shownProjects = filter === 'all' ? projects : projects.filter((p) => p.state === filter);
  const shownRows = filter === 'all' ? sortedRows : sortedRows.filter((r) => r.state === filter);
  const filterList = view === 'projects' ? PROJ_FILTERS : TASK_FILTERS;
  const loading = view === 'projects' ? projectsQ.isLoading : (projTasksQ.isLoading || myDirectQ.isLoading || iAssignedQ.isLoading);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Projects and Tasks</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowNewTask(true)} className="rounded-lg border border-pine px-4 py-2 text-sm font-medium text-pine hover:bg-pine-tint">+ New task</button>
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New project</button>
        </div>
      </div>

      {/* Primary: Projects | Tasks */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {[['projects', '▤ Projects'], ['tasks', '☰ Tasks']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
          ))}
        </div>

        {view === 'projects' && (
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            {[['mine', 'My projects'], ['all', 'All projects']].map(([s, label]) => (
              <button key={s} onClick={() => setProjScope(s)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${projScope === s ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
            ))}
          </div>
        )}

        {view === 'tasks' && (
          <>
            {/* Calendar is a *view of* tasks, not a peer of Projects */}
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {[['list', '☰ List'], ['calendar', '🗓 Calendar']].map(([v, label]) => (
                <button key={v} onClick={() => setTaskView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${taskView === v ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {[['me', 'To me'], ['by', 'By me'], ['all', 'All']].map(([s, label]) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === s ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Status filters, with per-filter counts */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filterList.map(([f, label]) => {
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${active ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft hover:border-pine'}`}>
              {label}
              <span className={`inline-flex min-w-[1.15rem] justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${active ? 'bg-white/25 text-white' : 'bg-line/60 text-ink-soft'}`}>{counts[f] || 0}</span>
            </button>
          );
        })}
      </div>

      {view === 'projects' && (
        <BoardView projects={shownProjects} loading={loading} userId={user?.id} isAdmin={isCeoAdmin(user)}
          onOpen={setOpenId} onChanged={() => qc.invalidateQueries({ queryKey: ['events'] })} />
      )}
      {view === 'tasks' && taskView === 'list' && (
        <TasksView rows={shownRows} scope={scope} loading={loading} onOpenProject={setOpenId} onChanged={invalidateTasks} />
      )}
      {view === 'tasks' && taskView === 'calendar' && (
        <TaskCalendar rows={shownRows} loading={loading} onOpenProject={setOpenId} />
      )}

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
      {showNewTask && <AssignTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}

// ── Projects (Board): owner + completion prominent, trigger muted ─────
function BoardView({ projects, loading, userId, isAdmin, onOpen, onChanged }) {
  const del = useMutation({ mutationFn: deleteEvent, onSuccess: onChanged });
  const [confirmId, setConfirmId] = useState(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      {loading && <p className="px-4 py-6 text-ink-soft">Loading…</p>}
      {!loading && projects.length === 0 && <p className="px-4 py-8 text-center text-ink-soft">No projects match this filter.</p>}
      {projects.map((e) => {
        const canDelete = e.ownerId === userId || isAdmin;
        return (
          <div key={e.id} className="group flex items-stretch border-b border-line/60 last:border-0 hover:bg-paper">
            <CompletionBar done={e.tasksDone} total={e.tasksTotal} />
            <button onClick={() => onOpen(e.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">
                  {e.name}
                  {e.approval === 'pending' && <span className="ml-2 rounded bg-ochre-tint px-1.5 py-0.5 text-[10px] font-medium text-ochre">pending</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
                  <span className="max-w-full truncate">Owner · <span className="font-medium text-ink">{e.owner?.name || '—'}</span></span>
                  <span className="shrink-0">· {e.tasksTotal ? <><span className="font-medium text-ink">{e.tasksDone}/{e.tasksTotal}</span> tasks done</> : 'no tasks yet'}</span>
                  <span className="shrink-0 font-mono text-ink-soft/80">· {triggerLabel(e)}</span>
                </div>
              </div>
              <StatusBadge state={e.state} />
            </button>
            {canDelete && (
              <div className="flex items-center pr-3">
                {confirmId === e.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <button onClick={() => del.mutate(e.id, { onSuccess: () => setConfirmId(null) })} disabled={del.isPending} className="rounded bg-brick px-2 py-1 font-medium text-white disabled:opacity-50">Delete</button>
                    <button onClick={() => setConfirmId(null)} className="rounded border border-line px-2 py-1 text-ink-soft">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmId(e.id)} title="Delete project"
                    className="rounded p-1.5 text-ink-soft opacity-0 hover:bg-brick/10 hover:text-brick group-hover:opacity-100">🗑</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tasks list: colour-coded status, prominent due + source, completion box ─
function TasksView({ rows, scope, loading, onOpenProject, onChanged }) {
  const qc = useQueryClient();
  const invalidate = onChanged || (() => qc.invalidateQueries());
  const toggleDir = useMutation({ mutationFn: toggleDirectTask, onSuccess: invalidate });
  const toggleProj = useMutation({ mutationFn: toggleTask, onSuccess: invalidate });
  const rejectDirect = useMutation({ mutationFn: (id) => rejectDirectAssignment(id, {}), onSuccess: invalidate });
  const delDirect = useMutation({ mutationFn: deleteDirectTask, onSuccess: invalidate });
  const addAssignees = useMutation({ mutationFn: ({ id, userIds }) => addDirectAssignees(id, userIds), onSuccess: invalidate });
  const removeAssignee = useMutation({ mutationFn: ({ id, userId }) => removeDirectAssignee(id, userId), onSuccess: invalidate });
  const [reassignId, setReassignId] = useState(null);

  if (loading) return <div className="rounded-2xl border border-line bg-white px-4 py-6 text-ink-soft">Loading…</div>;
  if (!rows.length) return <div className="rounded-2xl border border-line bg-white px-4 py-10 text-center text-ink-soft">{scope === 'me' ? 'No tasks assigned to you match this filter.' : scope === 'by' ? "You haven't assigned any tasks in this filter." : 'No tasks match this filter.'}</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      {rows.map((r) => {
        const canToggle = r.toMe || r.byMe;
        const showTo = (scope === 'by' || (scope === 'all' && r.byMe)) && r.assignees?.length;
        const meta = [];
        if (r.kind === 'project' && r.ownerName) meta.push(`Owner · ${r.ownerName}`);
        if (r.kind === 'direct' && r.by) meta.push(`by ${r.by}`);
        if (showTo) meta.push(`to ${r.assignees.map((a) => a.name).join(', ')}`);
        return (
          <div key={r.key} className="group border-b border-line/60 px-3 py-3 last:border-0 hover:bg-paper sm:px-4">
            <div className="flex items-start gap-3">
              <button disabled={!canToggle}
                onClick={() => canToggle && (r.kind === 'direct' ? toggleDir.mutate(r.id) : toggleProj.mutate(r.id))}
                title={canToggle ? (r.completed ? 'Mark not done' : 'Mark done') : 'Only the assignee or owner can update this'}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] ${r.completed ? 'border-sage bg-sage text-white' : r.overdue ? 'border-brick text-brick' : 'border-line'} ${canToggle ? 'hover:border-sage' : 'cursor-default opacity-60'}`}>
                {r.completed ? '✓' : ''}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => r.kind === 'project' && onOpenProject(r.projectId)}
                    className={`min-w-0 text-left ${r.kind === 'project' ? '' : 'cursor-default'}`}>
                    <span className={`block truncate text-[15px] font-semibold ${r.completed ? 'text-ink-soft line-through' : ''}`}>{r.title}</span>
                  </button>
                  <StatusBadge state={r.state} />
                </div>

                {/* prominent: source tag + due date/time */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {r.kind === 'direct'
                    ? <span className="rounded bg-ochre-tint/50 px-1.5 py-0.5 font-medium text-ochre">Direct task</span>
                    : <button onClick={() => onOpenProject(r.projectId)} className="max-w-[16rem] truncate rounded bg-pine-tint px-1.5 py-0.5 font-medium text-pine hover:opacity-80">{r.projectName}</button>}
                  {r.dueText && <span className={`font-semibold ${r.overdue && !r.completed ? 'text-brick' : 'text-ink'}`}>🕑 {r.dueText}</span>}
                </div>

                {meta.length > 0 && <div className="mt-0.5 truncate text-[11px] text-ink-soft">{meta.join(' · ')}</div>}

                {/* view details — only when the task has a description */}
                {r.description?.trim() && <TaskDetailsToggle text={r.description} />}

                {/* row actions */}
                {(r.toMe || r.byMe) && (
                  <div className="mt-1 flex items-center gap-3 text-[11px]">
                    {r.kind === 'direct' && r.toMe && !r.completed && <button onClick={() => rejectDirect.mutate(r.id)} className="text-ink-soft hover:text-brick">reject</button>}
                    {r.byMe && r.kind === 'direct' && (
                      <>
                        <button onClick={() => setReassignId(reassignId === r.key ? null : r.key)} className={`hover:text-pine ${reassignId === r.key ? 'text-pine' : 'text-ink-soft'}`}>reassign</button>
                        <button onClick={() => delDirect.mutate(r.id)} className="text-ink-soft hover:text-brick">delete</button>
                      </>
                    )}
                    {r.byMe && r.kind === 'project' && <button onClick={() => onOpenProject(r.projectId)} className="text-ink-soft hover:text-pine">edit</button>}
                  </div>
                )}

                {reassignId === r.key && r.raw && (
                  <div className="mt-1.5">
                    <ReassignControl assignees={r.raw.assignees || []} busy={addAssignees.isPending || removeAssignee.isPending}
                      onAdd={(userIds) => addAssignees.mutate({ id: r.id, userIds })}
                      onRemove={(uid) => removeAssignee.mutate({ id: r.id, userId: uid })} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Calendar: due-dated tasks on a month or week grid ────────────────
function TaskCalendar({ rows, loading, onOpenProject }) {
  const [mode, setMode] = useState('month'); // 'month' | 'week'
  const [cursor, setCursor] = useState(() => new Date());
  const dated = useMemo(() => rows.filter((r) => r.dueAt), [rows]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of dated) { const k = ymd(r.dueAt); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    for (const list of m.values()) list.sort((a, b) => a.dueAt - b.dueAt);
    return m;
  }, [dated]);

  const y = cursor.getFullYear(); const mo = cursor.getMonth();
  const undatedCount = rows.length - dated.length;

  const shift = (n) => { const d = new Date(cursor); if (mode === 'week') d.setDate(d.getDate() + n * 7); else d.setMonth(d.getMonth() + n); setCursor(d); };
  const label = mode === 'week'
    ? (() => { const ws = new Date(cursor); ws.setDate(ws.getDate() - ws.getDay()); const we = new Date(ws); we.setDate(we.getDate() + 6); return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}`; })()
    : `${MONTHS[mo]} ${y}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {[['month', 'Month'], ['week', 'Week']].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-sm font-medium ${mode === m ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">←</button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-ink">{label}</span>
          <button onClick={() => shift(1)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">→</button>
          <button onClick={() => setCursor(new Date())} className="ml-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-pine">Today</button>
        </div>
        {undatedCount > 0 && <span className="ml-auto text-xs text-ink-soft">{undatedCount} task{undatedCount === 1 ? '' : 's'} without a due date (not shown)</span>}
      </div>
      {loading ? <div className="rounded-2xl border border-line bg-white px-4 py-6 text-ink-soft">Loading…</div>
        : mode === 'month' ? <MonthGrid year={y} month={mo} byDay={byDay} onOpenProject={onOpenProject} />
        : <WeekStrip cursor={cursor} byDay={byDay} onOpenProject={onOpenProject} />}
    </div>
  );
}

function TaskChip({ r, onOpenProject }) {
  const m = STATE[r.state] || STATE.upcoming;
  return (
    <button onClick={() => r.kind === 'project' ? onOpenProject(r.projectId) : undefined}
      title={`${r.title} · ${r.projectName}${r.dueText ? ` · due ${r.dueText}` : ''}`}
      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:opacity-80 ${r.completed ? 'line-through opacity-60' : ''}`}
      style={{ color: m.c, background: m.b }}>
      {r.title}
    </button>
  );
}

function MonthGrid({ year, month, byDay, onOpenProject }) {
  const today = ymd(new Date());
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line bg-paper/60">
        {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[6rem] border-b border-r border-line/50 bg-paper/30 last:border-r-0" />;
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const items = byDay.get(date) || [];
          const isToday = date === today;
          return (
            <div key={i} className={`min-h-[6rem] border-b border-r border-line/50 p-1.5 align-top ${isToday ? 'bg-pine-tint/20' : ''}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-pine font-bold text-white' : 'text-ink-soft'}`}>{d}</span>
              </div>
              <div className="space-y-1">
                {items.slice(0, 4).map((r) => <TaskChip key={r.key} r={r} onOpenProject={onOpenProject} />)}
                {items.length > 4 && <span className="block px-1 text-[10px] text-ink-soft">+{items.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekStrip({ cursor, byDay, onOpenProject }) {
  const ws = new Date(cursor); ws.setDate(ws.getDate() - ws.getDay()); ws.setHours(0, 0, 0, 0);
  const today = ymd(new Date());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((d) => {
        const date = ymd(d);
        const items = byDay.get(date) || [];
        const isToday = date === today;
        return (
          <div key={date} className={`min-h-[8rem] rounded-xl border p-2 ${isToday ? 'border-pine bg-pine-tint/20' : 'border-line bg-white'}`}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{DOW[d.getDay()]}</span>
              <span className={`text-sm ${isToday ? 'font-bold text-pine' : 'text-ink'}`}>{d.getDate()}</span>
            </div>
            <div className="space-y-1">
              {items.length === 0 && <p className="pt-2 text-center text-[10px] text-ink-soft">—</p>}
              {items.map((r) => <TaskChip key={r.key} r={r} onOpenProject={onOpenProject} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
