import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext.jsx';
import { getEvent, toggleTask, updateEventSop } from '../../api/events.api.js';
import { STATE, triggerLabel, dueLabel } from './meta.js';

const triggerLabelDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
import EventChat from '../messages/EventChat.jsx';
import SopFields from './SopFields.jsx';

function Badge({ state }) {
  const m = STATE[state] || STATE.upcoming;
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{m.label}</span>;
}

export default function EventDrawer({ id, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id), retry: false });
  const toggle = useMutation({ mutationFn: toggleTask, onSuccess: () => qc.invalidateQueries() });

  const e = q.data;
  const isAdmin = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const canEditSop = !!e && (e.ownerId === user?.id || e.createdById === user?.id || isAdmin);

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
                {e.tasks.map((t) => {
                  const canToggle = t.assignees.some((a) => a.id === user?.id) || e.ownerId === user?.id;
                  return (
                    <div key={t.id} className="flex items-start gap-3 border-b border-line/60 pb-2 last:border-0">
                      <input type="checkbox" checked={t.completed} disabled={!canToggle || toggle.isPending}
                        onChange={() => toggle.mutate(t.id)} className="mt-1" />
                      <div className="flex-1">
                        <div className={`text-sm ${t.completed ? 'text-ink-soft line-through' : ''}`}>{t.name}</div>
                        <div className="text-xs text-ink-soft">
                          {t.assignees.map((a) => a.name).join(', ') || 'Unassigned'}
                          {dueLabel(e, t) ? ` · due ${dueLabel(e, t)}` : ''}
                          {t.completedLate ? ' · completed late' : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <EventChat eventId={id} />
          </>
        )}
      </div>
    </div>
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
