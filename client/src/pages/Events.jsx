import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents, getTaskList, deleteEvent } from '../api/events.api.js';
import { getMyTasks, getTasksIAssigned, toggleDirectTask, rejectDirectAssignment, deleteDirectTask, addDirectAssignees, removeDirectAssignee } from '../api/directTasks.api.js';
import ReassignControl from '../features/tasks/ReassignControl.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { STATE, FILTERS, triggerLabel, dueLabel, taskDueDate, MONTHS, ymd } from '../features/events/meta.js';
import EventDrawer from '../features/events/EventDrawer.jsx';
import NewEventModal from '../features/events/NewEventModal.jsx';
import AssignTaskModal from '../features/tasks/AssignTaskModal.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isCeoAdmin = (u) => u?.id === 'ceo' || u?.id === 'EP002' || u?.role === 'HR Head';

function Badge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}
function Dot({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: m.c }} />;
}

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
    key: `p${t.taskId}`, kind: 'project', id: t.taskId, projectId: t.projectId, title: t.name,
    projectName: t.projectName, ownerName: t.ownerName, assignees: t.assignees || [],
    completed: t.completed, overdue: t.overdue, state: t.state, dueAt, dueText: projTaskDueText(t),
    toMe: !!t.mine, byMe: t.ownerId === userId,
  };
}
function directRow(t, { toMe, byMe }) {
  const now = new Date();
  const dueAt = directDueDate(t);
  const overdue = !t.completed && !!dueAt && dueAt < now;
  const state = t.completed ? 'completed' : overdue ? 'overdue' : !dueAt ? 'current' : dueAt <= now ? 'current' : 'upcoming';
  return {
    key: `d${t.id}`, kind: 'direct', id: t.id, title: t.title,
    projectName: 'Direct task', by: t.assignerName, assignees: t.assignees || [],
    completed: t.completed, overdue, state, dueAt, dueText: directDueText(t),
    toMe, byMe, raw: t,
  };
}

export default function Events() {
  const { user } = useAuth();
  const [view, setView] = useState('board'); // 'board' | 'tasks' | 'calendar'
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState('me'); // 'me' | 'by' | 'all' — Tasks + Calendar
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  const qc = useQueryClient();
  // Board reads projects for the active filter (respects My-projects only on Board).
  const projectsQ = useQuery({ queryKey: ['events', filter, false], queryFn: () => getEvents(filter, false), retry: false, enabled: view === 'board' });
  // Tasks + Calendar read all project tasks for the filter, then split to/by client-side.
  const needTasks = view === 'tasks' || view === 'calendar';
  const projTasksQ = useQuery({ queryKey: ['task-list', filter, false], queryFn: () => getTaskList(filter, false), retry: false, enabled: needTasks });
  const myDirectQ = useQuery({ queryKey: ['direct-tasks-mine'], queryFn: getMyTasks, retry: false, enabled: needTasks });
  const iAssignedQ = useQuery({ queryKey: ['direct-tasks-assigned'], queryFn: getTasksIAssigned, retry: false, enabled: needTasks });

  const projects = projectsQ.data || [];
  const invalidateTasks = () => {
    qc.invalidateQueries({ queryKey: ['task-list'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-mine'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-assigned'] });
    qc.invalidateQueries({ queryKey: ['events'] });
  };

  // Unified rows for the active scope. Direct "mine" only carry the assigner's
  // view; "assigned" carry the recipients — so we pick the right source per scope.
  const rows = useMemo(() => {
    const pt = (projTasksQ.data || []);
    const mine = (myDirectQ.data || []).filter((t) => (t.assignees?.find((a) => a.id === user?.id) || {}).status !== 'rejected');
    const assigned = (iAssignedQ.data || []);
    if (scope === 'me') {
      return [...pt.filter((t) => t.mine).map((t) => projectRow(t, user?.id)), ...mine.map((t) => directRow(t, { toMe: true, byMe: false }))];
    }
    if (scope === 'by') {
      return [...pt.filter((t) => t.ownerId === user?.id).map((t) => projectRow(t, user?.id)), ...assigned.map((t) => directRow(t, { toMe: false, byMe: true }))];
    }
    // all: every project task + every direct task (dedupe self-assigned direct by id)
    const seen = new Set();
    const direct = [];
    for (const t of mine) { seen.add(t.id); direct.push(directRow(t, { toMe: true, byMe: t.assignerId === user?.id })); }
    for (const t of assigned) if (!seen.has(t.id)) direct.push(directRow(t, { toMe: false, byMe: true }));
    return [...pt.map((t) => projectRow(t, user?.id)), ...direct];
  }, [projTasksQ.data, myDirectQ.data, iAssignedQ.data, scope, user?.id]);

  const order = { overdue: 0, current: 1, upcoming: 2, undated: 3, completed: 4 };
  const sortedRows = useMemo(() => [...rows].sort((a, b) => (order[a.state] - order[b.state]) || ((a.dueAt?.getTime() || Infinity) - (b.dueAt?.getTime() || Infinity)) || a.title.localeCompare(b.title)), [rows]);

  const loading = view === 'board' ? projectsQ.isLoading : (projTasksQ.isLoading || myDirectQ.isLoading || iAssignedQ.isLoading);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Projects and Tasks</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowNewTask(true)} className="rounded-lg border border-pine px-4 py-2 text-sm font-medium text-pine hover:bg-pine-tint">+ New task</button>
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New project</button>
        </div>
      </div>

      {/* View switch */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {[['board', '▤ Board'], ['tasks', '☰ Tasks'], ['calendar', '🗓 Calendar']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
          ))}
        </div>
        {/* To me / By me / All — Tasks + Calendar only */}
        {view !== 'board' && (
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            {[['me', 'To me'], ['by', 'By me'], ['all', 'All tasks']].map(([s, label]) => (
              <button key={s} onClick={() => setScope(s)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === s ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Filter chips (state) */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>{label}</button>
        ))}
      </div>

      {view === 'board' && (
        <BoardView projects={projects} loading={loading} userId={user?.id} isAdmin={isCeoAdmin(user)}
          onOpen={setOpenId} onChanged={() => { qc.invalidateQueries({ queryKey: ['events'] }); }} />
      )}
      {view === 'tasks' && (
        <TasksView rows={sortedRows} scope={scope} loading={loading} userId={user?.id}
          onOpenProject={setOpenId} onChanged={invalidateTasks} />
      )}
      {view === 'calendar' && (
        <TaskCalendar rows={rows.filter((r) => (filter === 'all' || r.state === filter))} loading={loading} onOpenProject={setOpenId} />
      )}

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
      {showNewTask && <AssignTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}

// ── Board: project list with owner-only delete ───────────────────────
function BoardView({ projects, loading, userId, isAdmin, onOpen, onChanged }) {
  const del = useMutation({ mutationFn: deleteEvent, onSuccess: onChanged });
  const [confirmId, setConfirmId] = useState(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      {loading && <p className="px-4 py-6 text-ink-soft">Loading…</p>}
      {!loading && projects.length === 0 && <p className="px-4 py-6 text-ink-soft">No projects match this filter.</p>}
      {projects.map((e) => {
        const canDelete = e.ownerId === userId || isAdmin;
        return (
          <div key={e.id} className="group flex items-stretch border-b border-line/60 last:border-0 hover:bg-paper">
            <CompletionBar done={e.tasksDone} total={e.tasksTotal} />
            <button onClick={() => onOpen(e.id)} className="flex flex-1 flex-col gap-1 px-4 py-3 text-left sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-2 sm:contents">
                <div className="font-mono text-xs text-ink-soft sm:w-16 sm:shrink-0">{triggerLabel(e)}</div>
                <div className="ml-auto sm:hidden"><Badge state={e.state} /></div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{e.name}{e.approval === 'pending' && <span className="ml-2 rounded bg-ochre-tint px-1.5 py-0.5 text-[10px] font-medium text-ochre">pending</span>}</div>
                <div className="text-xs text-ink-soft">Owner · {e.owner?.name || '—'}{e.tasksTotal ? ` · ${e.tasksDone}/${e.tasksTotal} tasks` : ''}</div>
              </div>
              <div className="hidden sm:block"><Badge state={e.state} /></div>
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

// ── Tasks: unified list, split by To me / By me / All ────────────────
function TasksView({ rows, scope, loading, userId, onOpenProject }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-list'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-mine'] });
    qc.invalidateQueries({ queryKey: ['direct-tasks-assigned'] });
  };
  const toggleDirect = useMutation({ mutationFn: toggleDirectTask, onSuccess: invalidate });
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
        const showByLine = scope === 'by' || (scope === 'all' && r.byMe); // recipients shown in By-me / All, not in To-me
        return (
          <div key={r.key} className="group flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0 hover:bg-paper">
            {/* status */}
            {r.kind === 'direct' && r.toMe ? (
              <button onClick={() => toggleDirect.mutate(r.id)} title="Mark done"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${r.completed ? 'border-sage bg-sage text-white' : r.overdue ? 'border-brick' : 'border-line'}`}>{r.completed ? '✓' : ''}</button>
            ) : <Dot state={r.state} />}

            <button onClick={() => r.kind === 'project' ? onOpenProject(r.projectId) : undefined}
              className={`min-w-0 flex-1 text-left ${r.kind === 'project' ? 'cursor-pointer' : 'cursor-default'}`}>
              <div className={`truncate font-medium ${r.completed ? 'text-ink-soft line-through' : r.overdue ? 'text-brick' : ''}`}>{r.title}</div>
              <div className="truncate text-xs text-ink-soft">
                <span className={r.kind === 'direct' ? 'text-ochre' : ''}>{r.kind === 'direct' ? 'Direct task' : r.projectName}</span>
                {r.toMe && r.by ? ` · by ${r.by}` : ''}
                {showByLine && r.assignees?.length ? ` · to ${r.assignees.map((a) => a.name).join(', ')}` : ''}
                {r.dueText ? ` · due ${r.dueText}` : ''}
              </div>
            </button>

            {!r.completed && r.overdue && <span className="shrink-0 rounded bg-brick/10 px-1.5 py-0.5 text-[10px] font-medium text-brick">overdue</span>}
            <div className="hidden sm:block"><Badge state={r.state} /></div>

            {/* Row actions: reject (direct to me), reassign + delete (mine to give out) */}
            {r.kind === 'direct' && r.toMe && !r.completed && (
              <button onClick={() => rejectDirect.mutate(r.id)} className="text-[11px] text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">reject</button>
            )}
            {r.byMe && r.kind === 'direct' && (
              <>
                <button onClick={() => setReassignId(reassignId === r.key ? null : r.key)} className={`text-[11px] hover:text-pine ${reassignId === r.key ? 'text-pine' : 'text-ink-soft'} opacity-0 group-hover:opacity-100`}>reassign</button>
                <button onClick={() => delDirect.mutate(r.id)} title="Delete task" className="text-[11px] text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">🗑</button>
              </>
            )}
            {r.byMe && r.kind === 'project' && (
              <button onClick={() => onOpenProject(r.projectId)} title="Open project to delete this task" className="text-[11px] text-ink-soft opacity-0 hover:text-pine group-hover:opacity-100">edit</button>
            )}

            {reassignId === r.key && r.raw && (
              <div className="w-full basis-full pl-7">
                <ReassignControl assignees={r.raw.assignees || []} busy={addAssignees.isPending || removeAssignee.isPending}
                  onAdd={(userIds) => addAssignees.mutate({ id: r.id, userIds })}
                  onRemove={(uid) => removeAssignee.mutate({ id: r.id, userId: uid })} />
              </div>
            )}
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
