import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getApprovals, getApprovalHistory, approveEvent, rejectEvent, changeEventOwner,
  getProjectTaskApprovals, decideProjectTaskAssignee, getOwnerApprovals, decideOwnerTransfer,
  getExtensionApprovals, decideExtension,
} from '../api/events.api.js';
import { getTaskApprovals, decideDirectTask } from '../api/directTasks.api.js';
import { getUsers } from '../api/users.api.js';
import { triggerLabel } from '../features/events/meta.js';
import EventChat from '../features/messages/EventChat.jsx';

export default function Approvals() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event-approvals'], queryFn: getApprovals, retry: false });
  const directTaskQ = useQuery({ queryKey: ['task-approvals'], queryFn: getTaskApprovals, retry: false });
  const projTaskQ = useQuery({ queryKey: ['proj-task-approvals'], queryFn: getProjectTaskApprovals, retry: false });
  const ownerQ = useQuery({ queryKey: ['owner-approvals'], queryFn: getOwnerApprovals, retry: false });
  const extQ = useQuery({ queryKey: ['extension-approvals'], queryFn: getExtensionApprovals, retry: false });
  const historyQ = useQuery({ queryKey: ['approval-history'], queryFn: getApprovalHistory, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });

  const approve = useMutation({ mutationFn: approveEvent, onSuccess: () => qc.invalidateQueries() });
  const reject = useMutation({ mutationFn: rejectEvent, onSuccess: () => qc.invalidateQueries() });
  const owner = useMutation({ mutationFn: ({ id, ownerId }) => changeEventOwner(id, ownerId), onSuccess: () => qc.invalidateQueries() });
  const decideDirect = useMutation({ mutationFn: ({ taskId, userId, decision }) => decideDirectTask(taskId, userId, decision), onSuccess: () => qc.invalidateQueries() });
  const decideProj = useMutation({ mutationFn: ({ taskId, userId, decision }) => decideProjectTaskAssignee(taskId, userId, decision), onSuccess: () => qc.invalidateQueries() });
  const decideOwner = useMutation({ mutationFn: ({ id, decision }) => decideOwnerTransfer(id, decision), onSuccess: () => qc.invalidateQueries() });
  const decideExt = useMutation({ mutationFn: ({ taskId, decision }) => decideExtension(taskId, decision), onSuccess: () => qc.invalidateQueries() });

  const rows = q.data || [];
  const extRows = extQ.data || [];
  // Both task queues are per-recipient rows; tag them so each row calls the right
  // mutation, and normalise the label fields (direct: title / project: taskName).
  const taskRows = [
    ...(directTaskQ.data || []).map((t) => ({ ...t, kind: 'direct', label: t.title, context: `by ${t.assignerName || '—'}` })),
    ...(projTaskQ.data || []).map((t) => ({ ...t, kind: 'project', label: t.taskName, context: `${t.projectName} · by ${t.assignerName || '—'}` })),
  ];
  const ownerRows = ownerQ.data || [];
  const history = historyQ.data || [];

  const decideTask = (row, decision) => (row.kind === 'direct' ? decideDirect : decideProj)
    .mutate({ taskId: row.taskId, userId: row.userId, decision });

  const nothing = !q.isLoading && rows.length === 0 && taskRows.length === 0 && ownerRows.length === 0 && extRows.length === 0;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Approvals</h1>
      <p className="text-sm text-ink-soft">Tasks assigned to your reports, projects they create, and ownership changes — waiting for your sign-off.</p>

      {/* Task assignments — one row per recipient whose manager (you) must approve. */}
      {taskRows.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tasks · {taskRows.length}</div>
          {taskRows.map((t) => (
            <div key={`${t.kind}-${t.taskId}-${t.userId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <div>
                <div className="font-medium">{t.label} <span className="text-ink-soft">→ {t.userName}</span></div>
                <div className="text-sm text-ink-soft">{t.context}{t.dueDate ? ` · due ${t.dueDate}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => decideTask(t, 'rejected')} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Reject</button>
                <button onClick={() => decideTask(t, 'approved')} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ownership transfers held for the new owner's manager (you). */}
      {ownerRows.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Ownership changes · {ownerRows.length}</div>
          {ownerRows.map((o) => (
            <div key={o.eventId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-sm text-ink-soft">Owner {o.currentOwnerName || '—'} → {o.newOwnerName || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => decideOwner.mutate({ id: o.eventId, decision: 'rejected' })} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Reject</button>
                <button onClick={() => decideOwner.mutate({ id: o.eventId, decision: 'approved' })} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deadline-extension requests on tasks in projects you own. */}
      {extRows.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Extension requests · {extRows.length}</div>
          {extRows.map((x) => (
            <div key={x.taskId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <div>
                <div className="font-medium">{x.taskName} <span className="text-ink-soft">— {x.projectName}</span></div>
                <div className="text-sm text-ink-soft">{x.requestedBy} wants to move the due date {x.currentDue} → <span className="font-medium text-ink">{x.requestedDue}</span></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => decideExt.mutate({ taskId: x.taskId, decision: 'rejected' })} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Decline</button>
                <button onClick={() => decideExt.mutate({ taskId: x.taskId, decision: 'approved' })} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Projects · {rows.length}</div>}
      {q.isLoading && <p className="text-ink-soft">Loading…</p>}
      {nothing && (
        <div className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-ink-soft">Nothing awaiting your approval.</div>
      )}

      <div className="space-y-3">
        {rows.map((e) => (
          <ProjectCard key={e.id} e={e} users={users.data || []}
            onApprove={() => approve.mutate(e.id)} onReject={() => reject.mutate(e.id)}
            onOwner={(ownerId) => owner.mutate({ id: e.id, ownerId })} />
        ))}
      </div>

      {/* Decided history — projects you've already approved or rejected. */}
      {history.length > 0 && (
        <div className="space-y-2 border-t border-line pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Decided · {history.length}</div>
          {history.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/40 px-4 py-3">
              <div>
                <div className="font-medium">{e.name}</div>
                <div className="text-sm text-ink-soft">By {e.owner?.name || '—'}{e.decidedAt ? ` · ${new Date(e.decidedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${e.approval === 'approved' ? 'bg-sage/15 text-sage' : 'bg-brick/10 text-brick'}`}>
                {e.approval === 'approved' ? '✓ Approved' : '✕ Rejected'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A pending-project approval card with an inline Discuss panel — the SAME
// conversation as Messages → Project messages, so questions asked here are
// visible there (and vice versa).
function ProjectCard({ e, users, onApprove, onReject, onOwner }) {
  const [discuss, setDiscuss] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-serif text-lg font-semibold">{e.name}</div>
          <div className="text-sm text-ink-soft">
            Requested by {e.owner?.name} · {e.status === 'confirmed' ? triggerLabel(e) : 'Date TBD'} · {e.tasksTotal} task(s)
          </div>
          {e.writeup && <p className="mt-2 max-w-xl text-sm">{e.writeup}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReject} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brick hover:text-brick">Reject</button>
          <button onClick={onApprove} className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white">Approve</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <span className="text-ink-soft">Reassign owner:</span>
        <select defaultValue={e.ownerId} onChange={(ev) => onOwner(ev.target.value)} className="rounded border border-line px-2 py-1 text-xs">
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button onClick={() => setDiscuss((v) => !v)} className="ml-auto font-medium text-pine hover:underline">
          {discuss ? 'Hide discussion' : '💬 Discuss / ask a question'}
        </button>
      </div>
      {discuss && <EventChat eventId={e.id} />}
    </div>
  );
}
