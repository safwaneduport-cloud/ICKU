import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents } from '../api/events.api.js';
import { getMyTasks, getTasksIAssigned, toggleDirectTask, rejectDirectAssignment, deleteDirectTask, addDirectAssignees, removeDirectAssignee } from '../api/directTasks.api.js';
import ReassignControl from '../features/tasks/ReassignControl.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { STATE, FILTERS, triggerLabel } from '../features/events/meta.js';
import EventDrawer from '../features/events/EventDrawer.jsx';
import NewEventModal from '../features/events/NewEventModal.jsx';
import AssignTaskModal from '../features/tasks/AssignTaskModal.jsx';

function Badge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}

const taskDueLabel = (t) => {
  if (!t.dueDate) return '';
  const d = new Date(`${t.dueDate}T${t.dueTime || '00:00'}:00`);
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return t.dueTime ? `${date}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : date;
};

export default function Events() {
  const [filter, setFilter] = useState('all');
  const [mine, setMine] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  const q = useQuery({ queryKey: ['events', filter, mine], queryFn: () => getEvents(filter, mine), retry: false });
  const rows = q.data || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Projects and Tasks</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowNewTask(true)} className="rounded-lg border border-pine px-4 py-2 text-sm font-medium text-pine hover:bg-pine-tint">+ New task</button>
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New project</button>
        </div>
      </div>

      <DirectTasks />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${filter === f ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My tasks only
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {q.isLoading && <p className="px-4 py-6 text-ink-soft">Loading…</p>}
        {!q.isLoading && rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No projects match this filter.</p>}
        {rows.map((e) => (
          // Phone: date and state ride above the name so the title gets the full
          // width. From sm up it's the original three-column row.
          <button key={e.id} onClick={() => setOpenId(e.id)}
            className="flex w-full flex-col gap-1 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-paper sm:flex-row sm:items-center sm:gap-4">
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
        ))}
      </div>

      {openId && <EventDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
      {showNewTask && <AssignTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}

// Standalone (ad-hoc) tasks — assigned to me, plus a peek at ones I assigned.
function DirectTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mineQ = useQuery({ queryKey: ['direct-tasks-mine'], queryFn: getMyTasks, retry: false });
  const assignedQ = useQuery({ queryKey: ['direct-tasks-assigned'], queryFn: getTasksIAssigned, retry: false });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['direct-tasks-mine'] }); qc.invalidateQueries({ queryKey: ['direct-tasks-assigned'] }); };
  const toggle = useMutation({ mutationFn: toggleDirectTask, onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id) => rejectDirectAssignment(id, {}), onSuccess: invalidate });
  const del = useMutation({ mutationFn: deleteDirectTask, onSuccess: invalidate });
  const addAssignees = useMutation({ mutationFn: ({ id, userIds }) => addDirectAssignees(id, userIds), onSuccess: invalidate });
  const removeAssignee = useMutation({ mutationFn: ({ id, userId }) => removeDirectAssignee(id, userId), onSuccess: invalidate });
  const [reassignId, setReassignId] = useState(null);

  const mine = (mineQ.data || []).filter((t) => (t.assignees.find((a) => a.id === user?.id) || {}).status !== 'rejected');
  const iAssigned = assignedQ.data || [];
  const pendingMine = iAssigned.filter((t) => t.approval === 'pending');
  if (!mine.length && !iAssigned.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">My tasks · {mine.length}</div>
        <div className="mt-2 space-y-1.5">
          {mine.length === 0 && <p className="text-sm text-ink-soft">No tasks assigned to you.</p>}
          {mine.map((t) => (
            <div key={t.id} className="group flex items-center gap-2 border-b border-line/60 py-1 text-sm last:border-0">
              <button onClick={() => toggle.mutate(t.id)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${t.completed ? 'border-sage bg-sage text-white' : t.overdue ? 'border-brick' : 'border-line'}`}>
                {t.completed ? '✓' : ''}
              </button>
              <span className={`flex-1 ${t.completed ? 'text-ink-soft line-through' : t.overdue ? 'text-brick' : ''}`}>{t.title}</span>
              {taskDueLabel(t) && <span className="text-[11px] text-ink-soft">due {taskDueLabel(t)}</span>}
              <span className="text-[11px] text-ink-soft">by {t.assignerName}</span>
              {!t.completed && <button onClick={() => reject.mutate(t.id)} className="text-[11px] text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">reject</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">I assigned · {iAssigned.length}{pendingMine.length ? ` · ${pendingMine.length} pending approval` : ''}</div>
        <div className="mt-2 space-y-1.5">
          {iAssigned.length === 0 && <p className="text-sm text-ink-soft">You haven't assigned any tasks.</p>}
          {iAssigned.map((t) => (
            <div key={t.id} className="border-b border-line/60 py-1 last:border-0">
              <div className="group flex items-center gap-2 text-sm">
                <span className={`flex-1 ${t.completed ? 'text-ink-soft line-through' : ''}`}>{t.title}</span>
                <span className="text-[11px] text-ink-soft">
                  {t.assignees.map((a, i) => (
                    <span key={a.id}>{i > 0 && ', '}{a.name}
                      {a.approval === 'pending' && <span className="text-ochre"> (awaiting mgr)</span>}
                      {a.approval === 'rejected' && <span className="text-brick"> (declined by mgr)</span>}
                      {a.status === 'rejected' && <span className="text-brick"> (rejected)</span>}
                    </span>
                  ))}
                </span>
                {t.completed && <span className="rounded bg-sage/15 px-1.5 text-[10px] text-sage">done</span>}
                <button onClick={() => setReassignId(reassignId === t.id ? null : t.id)}
                  className={`text-[11px] hover:text-pine ${reassignId === t.id ? 'text-pine' : 'text-ink-soft'}`}>reassign</button>
                <button onClick={() => del.mutate(t.id)} className="text-[11px] text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">✕</button>
              </div>
              {reassignId === t.id && (
                <ReassignControl assignees={t.assignees}
                  busy={addAssignees.isPending || removeAssignee.isPending}
                  onAdd={(userIds) => addAssignees.mutate({ id: t.id, userIds })}
                  onRemove={(userId) => removeAssignee.mutate({ id: t.id, userId })} />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
