import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext.jsx';
import { getEvent, toggleTask, updateEventSop, rejectAssignment, requestExtension, decideExtension, changeEventOwner, addTaskAssignees, removeTaskAssignee, addProjectTask, deleteEvent, deleteProjectTask, updateEvent, updateProjectTask } from '../../api/events.api.js';
import { getUsers } from '../../api/users.api.js';
import { groupByDept } from '../../lib/orgGroups.js';
import ReassignControl from '../tasks/ReassignControl.jsx';
import AssignPicker from './AssignPicker.jsx';
import { STATE, MONTHS, triggerLabel, dueLabel, anchorDate } from './meta.js';

// A new task's default due — today at 6 PM as an offset from the project trigger.
const todayDueFor = (e) => {
  if (e.status !== 'confirmed' || !e.triggerMonth) return { dueOffset: null, dueTime: null };
  const anchor = anchorDate(e.triggerMonth, e.triggerDay || 1);
  const now = new Date();
  const off = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86400000);
  return { dueOffset: Math.max(0, off), dueTime: '18:00' };
};
const fmtWhen = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const triggerLabelDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
import EventChat from '../messages/EventChat.jsx';
import SopFields from './SopFields.jsx';
import DueDatePicker from './DueDatePicker.jsx';

// A proposed extension offset+time → a human date, using the project's anchor.
const proposedLabel = (e, ext) => dueLabel(e, { dueOffset: ext.offset, dueTime: ext.time });

function Badge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}

export default function EventDrawer({ id, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id), retry: false });
  const toggle = useMutation({ mutationFn: toggleTask, onSuccess: () => qc.invalidateQueries() });
  const reject = useMutation({ mutationFn: ({ taskId, reason }) => rejectAssignment(taskId, { reason }), onSuccess: () => qc.invalidateQueries() });
  const extend = useMutation({ mutationFn: ({ taskId, dueOffset, dueTime }) => requestExtension(taskId, { dueOffset, dueTime }), onSuccess: () => qc.invalidateQueries() });
  const decideExt = useMutation({ mutationFn: ({ taskId, decision }) => decideExtension(taskId, decision), onSuccess: () => qc.invalidateQueries() });

  const del = useMutation({ mutationFn: () => deleteEvent(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['task-list'] }); onClose(); } });
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);

  const e = q.data;
  const isAdmin = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const canEditSop = !!e && (e.ownerId === user?.id || e.createdById === user?.id || isAdmin);
  const canDelete = !!e && (e.ownerId === user?.id || isAdmin);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-6" onClick={(ev) => ev.stopPropagation()}>
        {q.isLoading || !e ? <p className="text-ink-soft">Loading…</p> : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge state={e.state} />
                  {e.approval === 'pending' && <span className="rounded bg-ochre-tint px-2 py-0.5 text-xs font-medium text-ochre">Pending approval</span>}
                </div>
                <h2 className="mt-2 font-serif text-2xl font-bold">{e.name}</h2>
                <p className="text-sm text-ink-soft">
                  Owner · {e.owner?.name || '—'} · {e.status === 'confirmed' ? triggerLabel(e) : e.status === 'multiple' ? 'Multiple dates' : 'Date TBD'}
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm">Close</button>
            </div>

            {canDelete && !editing && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1 text-sm hover:border-pine">✎ Edit</button>
                {confirmDel ? (
                  <>
                    <span className="text-xs text-ink-soft">Delete this project and all its tasks?</span>
                    <button onClick={() => del.mutate()} disabled={del.isPending} className="rounded-lg bg-brick px-3 py-1 text-sm font-medium text-white disabled:opacity-50">{del.isPending ? 'Deleting…' : 'Delete'}</button>
                    <button onClick={() => setConfirmDel(false)} className="rounded-lg border border-line px-3 py-1 text-sm">Keep</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="rounded-lg border border-brick/40 px-3 py-1 text-sm text-brick hover:bg-brick/5">🗑 Delete project</button>
                )}
              </div>
            )}

            {editing
              ? <EditProjectForm e={e} onClose={() => setEditing(false)} onSaved={() => qc.invalidateQueries()} />
              : e.description
                ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-white p-3 text-sm text-ink">{e.description}</p>
                : null}

            <OwnerControl e={e} user={user} onDone={() => qc.invalidateQueries()} />

            <SopSection e={e} canEdit={canEditSop} onSaved={() => qc.invalidateQueries()} />

            {e.meetings?.length > 0 && (
              <section className="mt-4 rounded-2xl border border-line bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Meetings held · {e.meetings.length}</div>
                <div className="mt-2 space-y-1.5">
                  {e.meetings.map((mt) => (
                    <div key={mt.id} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{mt.title}</span>
                        <span className="shrink-0 text-xs text-ink-soft">{triggerLabelDate(mt.date)} · {mt.time}</span>
                      </div>
                      <div className="text-xs text-ink-soft">{mt.owner?.name} · chair</div>
                      {(mt.minutes || mt.minutesFileUrl) && (
                        <div className="mt-1 flex items-center gap-2">
                          {mt.minutes && <p className="line-clamp-2 flex-1 text-xs text-ink-soft">{mt.minutes}</p>}
                          {mt.minutesFileUrl && <a href={mt.minutesFileUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-pine hover:underline">📄 Minutes</a>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-4 rounded-2xl border border-line bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tasks · {e.tasksDone}/{e.tasksTotal}</div>
              <div className="mt-3 space-y-2">
                {e.tasks.length === 0 && <p className="text-sm text-ink-soft">No tasks.</p>}
                {e.tasks.map((t) => (
                  <TaskItem key={t.id} e={e} t={t} user={user} toggle={toggle} reject={reject} extend={extend} decideExt={decideExt} />
                ))}
              </div>
              {(e.ownerId === user?.id || isAdmin) && <AddTaskForm e={e} onAdded={() => qc.invalidateQueries()} />}
            </section>

            {e.activity?.length > 0 && (
              <section className="mt-4 rounded-2xl border border-line bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">History</div>
                <div className="mt-2 space-y-1.5">
                  {e.activity.map((a) => (
                    <div key={a.id} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 text-ink"><span className="font-medium">{a.actorName || 'Someone'}</span> {a.text}</span>
                      <span className="shrink-0 text-ink-soft">{fmtWhen(a.at)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <EventChat eventId={id} />
          </>
        )}
      </div>
    </div>
  );
}

// One task row: completion + assignee statuses, plus the assignee's reject /
// request-extension controls and the owner's approve-extension controls.
// Edit a project's core values (owner/admin): title, description, date. SOP has
// its own inline editor below; tasks are edited on their own rows.
function EditProjectForm({ e, onClose, onSaved }) {
  const qc = useQueryClient();
  const [name, setName] = useState(e.name);
  const [description, setDescription] = useState(e.description || '');
  const [dated, setDated] = useState(e.status === 'confirmed');
  const [month, setMonth] = useState(e.triggerMonth || 7);
  const [day, setDay] = useState(e.triggerDay || 1);
  const save = useMutation({
    mutationFn: () => updateEvent(e.id, {
      name: name.trim(), description,
      status: dated ? 'confirmed' : 'tbd',
      triggerMonth: dated ? month : null,
      triggerDay: dated ? Math.min(31, Math.max(1, parseInt(day, 10) || 1)) : null,
    }),
    onSuccess: () => { qc.invalidateQueries(); onSaved?.(); onClose(); },
  });
  return (
    <div className="mt-3 rounded-2xl border border-pine/40 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Edit project</div>
      <label className="mt-2 block text-sm"><span className="text-ink-soft">Title</span>
        <input value={name} onChange={(ev) => setName(ev.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" /></label>
      <label className="mt-2 block text-sm"><span className="text-ink-soft">Description</span>
        <textarea value={description} onChange={(ev) => setDescription(ev.target.value)} rows={2} placeholder="Optional" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" /></label>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="block text-sm"><span className="text-ink-soft">Date</span>
          <select value={dated ? 'fixed' : 'tbd'} onChange={(ev) => setDated(ev.target.value === 'fixed')} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm">
            <option value="fixed">Fixed</option><option value="tbd">TBD</option>
          </select></label>
        {dated && (
          <>
            <label className="block text-sm"><span className="text-ink-soft">Month</span>
              <select value={month} onChange={(ev) => setMonth(+ev.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm">
                {MONTHS.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
              </select></label>
            <label className="block text-sm"><span className="text-ink-soft">Day</span>
              <input type="text" inputMode="numeric" value={day} onChange={(ev) => setDay(ev.target.value.replace(/\D/g, ''))}
                onBlur={() => setDay(Math.min(31, Math.max(1, parseInt(day, 10) || 1)))} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm" /></label>
          </>
        )}
      </div>
      {save.error && <p className="mt-1 text-xs text-brick">{save.error.response?.data?.error?.message || 'Could not save'}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancel</button>
        <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}

function TaskItem({ e, t, user, toggle, reject, extend, decideExt }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [extending, setExtending] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [propose, setPropose] = useState({ dueOffset: t.dueOffset ?? 0, dueTime: t.dueTime || null });

  const addAssignees = useMutation({ mutationFn: (userIds) => addTaskAssignees(t.id, userIds), onSuccess: () => qc.invalidateQueries() });
  const removeAssignee = useMutation({ mutationFn: (userId) => removeTaskAssignee(t.id, userId), onSuccess: () => qc.invalidateQueries() });
  const delTask = useMutation({ mutationFn: () => deleteProjectTask(t.id), onSuccess: () => qc.invalidateQueries() });
  const [confirmDel, setConfirmDel] = useState(false);
  const editT = useMutation({ mutationFn: (patch) => updateProjectTask(t.id, patch), onSuccess: () => qc.invalidateQueries() });
  const [editing, setEditing] = useState(false);
  const [ename, setEname] = useState(t.name);
  const [edue, setEdue] = useState({ dueOffset: t.dueOffset, dueTime: t.dueTime });

  const mine = t.assignees.find((a) => a.id === user?.id);
  // "Live for me" needs both: my manager approved the assignment AND I haven't declined it.
  const isAccepted = !!mine && mine.status !== 'rejected' && mine.approval === 'approved';
  const isOwner = e.ownerId === user?.id;
  const dated = e.status === 'confirmed' && !!e.triggerMonth;
  const rejected = t.assignees.filter((a) => a.status === 'rejected');
  const busy = reject.isPending || extend.isPending || decideExt.isPending || toggle.isPending;

  return (
    <div className="border-b border-line/60 pb-2 last:border-0">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={t.completed} disabled={!(isAccepted || isOwner) || busy}
          onChange={() => toggle.mutate(t.id)} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${t.completed ? 'text-ink-soft line-through' : ''}`}>{t.name}</div>
          <div className="text-xs text-ink-soft">
            {t.assignees.length === 0 ? 'Unassigned' : t.assignees.map((a, i) => (
              <span key={a.id}>{i > 0 && ', '}
                <span className={a.status === 'rejected' ? 'text-brick line-through' : ''}>{a.name}</span>
                {a.approval === 'pending' && <span className="text-ochre"> (awaiting mgr)</span>}
                {a.approval === 'rejected' && <span className="text-brick"> (declined by mgr)</span>}
              </span>
            ))}
            {dueLabel(e, t) ? ` · due ${dueLabel(e, t)}` : ''}
            {t.completedLate ? ' · completed late' : ''}
          </div>

          {/* rejection reasons (visible to everyone on the task) */}
          {rejected.map((a) => (
            <div key={a.id} className="mt-0.5 text-[11px] text-brick">✕ {a.name} rejected{a.rejectedReason ? `: ${a.rejectedReason}` : ''}</div>
          ))}

          {/* pending extension — the owner decides */}
          {t.ext && (
            <div className="mt-1.5 rounded-lg border border-ochre/40 bg-ochre-tint/40 px-2.5 py-1.5 text-xs">
              <span className="text-ochre">⏳ Extension requested → {proposedLabel(e, t.ext)}</span>
              {isOwner && (
                <div className="mt-1 flex gap-2">
                  <button disabled={busy} onClick={() => decideExt.mutate({ taskId: t.id, decision: 'approved' })}
                    className="rounded bg-pine px-2 py-0.5 font-medium text-white disabled:opacity-50">Approve</button>
                  <button disabled={busy} onClick={() => decideExt.mutate({ taskId: t.id, decision: 'rejected' })}
                    className="rounded border border-line px-2 py-0.5 hover:border-brick hover:text-brick disabled:opacity-50">Decline</button>
                </div>
              )}
            </div>
          )}

          {/* assignee actions */}
          {isAccepted && !t.completed && !rejecting && !extending && (
            <div className="mt-1.5 flex gap-3 text-[11px]">
              <button onClick={() => setRejecting(true)} className="text-ink-soft hover:text-brick">Reject</button>
              {dated && !t.ext && <button onClick={() => setExtending(true)} className="text-ink-soft hover:text-pine">Request extension</button>}
            </div>
          )}

          {/* owner controls — edit, reassign (each new recipient re-gated), delete */}
          {isOwner && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <button onClick={() => { setEditing((v) => !v); setEname(t.name); setEdue({ dueOffset: t.dueOffset, dueTime: t.dueTime }); }} className={`hover:text-pine ${editing ? 'text-pine' : 'text-ink-soft'}`}>Edit</button>
              <button onClick={() => setReassigning((v) => !v)} className={`hover:text-pine ${reassigning ? 'text-pine' : 'text-ink-soft'}`}>Reassign</button>
              {confirmDel ? (
                <span className="flex items-center gap-1.5">
                  <button onClick={() => delTask.mutate()} disabled={delTask.isPending} className="rounded bg-brick px-1.5 py-0.5 font-medium text-white disabled:opacity-50">Delete</button>
                  <button onClick={() => setConfirmDel(false)} className="text-ink-soft">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(true)} className="text-ink-soft hover:text-brick">Delete task</button>
              )}
            </div>
          )}
          {editing && (
            <div className="mt-1.5 space-y-2 rounded-lg border border-pine/30 bg-white p-2">
              <input value={ename} onChange={(ev) => setEname(ev.target.value)} placeholder="Task name"
                className="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:border-pine" />
              {dated && <DueDatePicker anchor={anchorDate(e.triggerMonth, e.triggerDay)} value={edue} onChange={setEdue} required />}
              <div className="flex gap-2 text-[11px]">
                <button disabled={editT.isPending || !ename.trim()} onClick={() => editT.mutate({ name: ename.trim(), dueOffset: edue.dueOffset, dueTime: edue.dueTime }, { onSuccess: () => setEditing(false) })}
                  className="rounded bg-pine px-2 py-0.5 font-medium text-white disabled:opacity-50">Save</button>
                <button onClick={() => setEditing(false)} className="text-ink-soft">Cancel</button>
              </div>
            </div>
          )}
          {reassigning && (
            <ReassignControl assignees={t.assignees} busy={addAssignees.isPending || removeAssignee.isPending}
              onAdd={(userIds) => addAssignees.mutate(userIds)} onRemove={(userId) => removeAssignee.mutate(userId)} />
          )}

          {rejecting && (
            <div className="mt-1.5 space-y-1.5">
              <input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (optional)"
                className="w-full rounded-lg border border-line px-2 py-1 text-xs outline-none focus:border-pine" />
              <div className="flex gap-2 text-[11px]">
                <button disabled={busy} onClick={() => reject.mutate({ taskId: t.id, reason })}
                  className="rounded bg-brick px-2 py-0.5 font-medium text-white disabled:opacity-50">Confirm reject</button>
                <button onClick={() => { setRejecting(false); setReason(''); }} className="text-ink-soft">Cancel</button>
              </div>
            </div>
          )}

          {extending && dated && (
            <div className="mt-1.5 space-y-1.5">
              <span className="text-[11px] text-ink-soft">Propose a new deadline:</span>
              <DueDatePicker anchor={anchorDate(e.triggerMonth, e.triggerDay)} value={propose} onChange={setPropose} />
              <div className="flex gap-2 text-[11px]">
                <button disabled={busy || propose.dueOffset == null} onClick={() => extend.mutate({ taskId: t.id, dueOffset: propose.dueOffset, dueTime: propose.dueTime })}
                  className="rounded bg-pine px-2 py-0.5 font-medium text-white disabled:opacity-50">Send request</button>
                <button onClick={() => setExtending(false)} className="text-ink-soft">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add a new task to an existing project (owner/admin). Same rules as creation:
// on a dated project the due date is required and can't precede the trigger.
function AddTaskForm({ e, onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [due, setDue] = useState(() => todayDueFor(e)); // default: today at 6 PM
  const [assignees, setAssignees] = useState([]);
  const dated = e.status === 'confirmed' && !!e.triggerMonth;
  const add = useMutation({
    mutationFn: () => addProjectTask(e.id, { name: name.trim(), dueOffset: due.dueOffset, dueTime: due.dueTime, assigneeIds: assignees }),
    onSuccess: () => { setName(''); setDue({ dueOffset: null, dueTime: null }); setAssignees([]); setOpen(false); onAdded(); },
  });
  const canAdd = name.trim() && (!dated || (due.dueOffset != null && due.dueOffset !== '')) && !add.isPending;

  if (!open) return (
    <button onClick={() => setOpen(true)} className="mt-3 w-full rounded-lg border border-dashed border-line py-2 text-sm font-medium text-pine hover:border-pine hover:bg-pine-tint/40">+ Add task</button>
  );
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper/40 p-3">
      <input value={name} autoFocus onChange={(ev) => setName(ev.target.value)} placeholder="What needs doing?"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
      {dated && (
        <div className="mt-2 flex items-center gap-2">
          <DueDatePicker anchor={anchorDate(e.triggerMonth, e.triggerDay)} value={due} onChange={setDue} required />
          {name.trim() && due.dueOffset == null && <span className="text-[11px] text-brick">Due date required</span>}
        </div>
      )}
      <div className="mt-2"><AssignPicker value={assignees} onChange={setAssignees} /></div>
      {add.error && <p className="mt-1 text-xs text-brick">{add.error.response?.data?.error?.message || 'Could not add the task'}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancel</button>
        <button onClick={() => add.mutate()} disabled={!canAdd} className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {add.isPending ? 'Adding…' : 'Add task'}
        </button>
      </div>
    </div>
  );
}

// Ownership transfer. Only the current owner (or an admin) may initiate one; if
// the new owner's projects need approval, the transfer waits for their manager
// and the project keeps running under the current owner until then. The pending
// state is shown to everyone who opens the project.
function OwnerControl({ e, user, onDone }) {
  const isAdmin = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const canTransfer = e.ownerId === user?.id || isAdmin;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Lazy: only pull the (large) directory once the picker is opened.
  const usersQ = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false, enabled: (canTransfer && open) || !!e.pendingOwnerId });
  const move = useMutation({ mutationFn: (ownerId) => changeEventOwner(e.id, ownerId), onSuccess: onDone });
  const nameOf = (id) => (usersQ.data || []).find((u) => u.id === id)?.name || id;

  if (!canTransfer && !e.pendingOwnerId) return null;
  const groups = groupByDept((usersQ.data || []).filter((u) => u.id !== e.ownerId), q);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Ownership</div>
        {canTransfer && !e.pendingOwnerId && (
          <button onClick={() => { setOpen((v) => !v); setQ(''); }} className="text-xs font-medium text-pine hover:underline">{open ? 'Cancel' : 'Change owner'}</button>
        )}
      </div>
      {e.pendingOwnerId ? (
        <p className="mt-2 text-sm text-ochre">⏳ Transfer to {nameOf(e.pendingOwnerId)} is pending their manager's approval. The project stays with {e.owner?.name || '—'} until then.</p>
      ) : (
        <p className="mt-1 text-sm text-ink">Current owner · <span className="font-medium">{e.owner?.name || '—'}</span></p>
      )}

      {open && canTransfer && !e.pendingOwnerId && (
        <div className="mt-2">
          {/* Same searchable, department-grouped picker as task assignment. */}
          <input value={q} onChange={(ev) => setQ(ev.target.value)} autoFocus placeholder="Search name, role or department…"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
          <div className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-line">
            {usersQ.isLoading && <p className="px-3 py-2 text-xs text-ink-soft">Loading people…</p>}
            {!usersQ.isLoading && groups.length === 0 && <p className="px-3 py-2 text-xs text-ink-soft">No matches.</p>}
            {groups.map(([dept, members]) => (
              <div key={dept}>
                <div className="sticky top-0 bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{dept} · {members.length}</div>
                {members.map((u) => (
                  <button key={u.id} disabled={move.isPending}
                    onClick={() => move.mutate(u.id, { onSuccess: () => { setOpen(false); setQ(''); } })}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-pine-tint disabled:opacity-50">
                    <span className="truncate">{u.name}</span>
                    <span className="shrink-0 truncate text-xs text-ink-soft">{u.role}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">If the new owner's projects need approval, the transfer waits for their manager.</p>
        </div>
      )}
    </section>
  );
}

// The event's SOP: write-up + PDF/link attachments. Editable in place by the
// owner/creator/admin; whatever's here is mirrored into the Knowledge Base.
function SopSection({ e, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [writeup, setWriteup] = useState(e.writeup || '');
  const [atts, setAtts] = useState((e.attachments || []).map((a) => ({ kind: a.kind, label: a.label, url: a.url })));
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => updateEventSop(e.id, { writeup, attachments: atts }),
    onSuccess: () => { setEditing(false); setErr(''); onSaved(); },
    onError: (ex) => setErr(ex.response?.data?.error?.message || 'Could not save the SOP'),
  });

  const start = () => {
    setWriteup(e.writeup || '');
    setAtts((e.attachments || []).map((a) => ({ kind: a.kind, label: a.label, url: a.url })));
    setEditing(true);
  };

  const isEmpty = !e.writeup && !(e.attachments || []).length;

  return (
    <section className="mt-5 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">SOP</div>
        {canEdit && !editing && (
          <button onClick={start} className="text-xs font-medium text-pine hover:underline">
            {isEmpty ? '+ Add SOP' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <SopFields writeup={writeup} onWriteup={setWriteup} attachments={atts} onAttachments={setAtts} />
          {err && <p className="mt-1 text-xs text-brick">{err}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setErr(''); }} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              {save.isPending ? 'Saving…' : 'Save SOP'}
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <p className="mt-2 text-sm text-ink-soft">No SOP yet.</p>
      ) : (
        <>
          {e.writeup && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.writeup}</p>}
          {e.attachments?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {e.attachments.map((a) => (
                <a key={a.id} href={a.url || '#'} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-pine">
                  {a.kind === 'pdf' ? '📄' : '🔗'} {a.label}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
