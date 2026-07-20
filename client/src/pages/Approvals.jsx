import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApprovals, approveEvent, rejectEvent, changeEventOwner } from '../api/events.api.js';
import { getTaskApprovals, decideDirectTask } from '../api/directTasks.api.js';
import { getUsers } from '../api/users.api.js';
import { triggerLabel } from '../features/events/meta.js';

export default function Approvals() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event-approvals'], queryFn: getApprovals, retry: false });
  const taskQ = useQuery({ queryKey: ['task-approvals'], queryFn: getTaskApprovals, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const approve = useMutation({ mutationFn: approveEvent, onSuccess: () => qc.invalidateQueries() });
  const reject = useMutation({ mutationFn: rejectEvent, onSuccess: () => qc.invalidateQueries() });
  const owner = useMutation({ mutationFn: ({ id, ownerId }) => changeEventOwner(id, ownerId), onSuccess: () => qc.invalidateQueries() });
  const decideTask = useMutation({ mutationFn: ({ id, decision }) => decideDirectTask(id, decision), onSuccess: () => qc.invalidateQueries() });

  const rows = q.data || [];
  const taskRows = taskQ.data || [];

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Approvals</h1>
      <p className="text-sm text-ink-soft">Projects and tasks created by your team, waiting for your sign-off.</p>

      {/* Task approvals */}
      {taskRows.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tasks · {taskRows.length}</div>
          {taskRows.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="text-sm text-ink-soft">By {t.assignerName} → {t.assignees.map((a) => a.name).join(', ')}{t.dueDate ? ` · due ${t.dueDate}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => decideTask.mutate({ id: t.id, decision: 'rejected' })} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Reject</button>
                <button onClick={() => decideTask.mutate({ id: t.id, decision: 'approved' })} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Projects · {rows.length}</div>}
      {q.isLoading && <p className="text-ink-soft">Loading…</p>}
      {!q.isLoading && rows.length === 0 && taskRows.length === 0 && (
        <div className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-ink-soft">Nothing awaiting your approval.</div>
      )}

      <div className="space-y-3">
        {rows.map((e) => (
          <div key={e.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-serif text-lg font-semibold">{e.name}</div>
                <div className="text-sm text-ink-soft">
                  Requested by {e.owner?.name} · {e.status === 'confirmed' ? triggerLabel(e) : 'Date TBD'} · {e.tasksTotal} task(s)
                </div>
                {e.writeup && <p className="mt-2 max-w-xl text-sm">{e.writeup}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => reject.mutate(e.id)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Reject</button>
                <button onClick={() => approve.mutate(e.id)} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
              <span className="text-ink-soft">Reassign owner:</span>
              <select defaultValue={e.ownerId} onChange={(ev) => owner.mutate({ id: e.id, ownerId: ev.target.value })}
                className="rounded border border-line px-2 py-1 text-xs">
                {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
