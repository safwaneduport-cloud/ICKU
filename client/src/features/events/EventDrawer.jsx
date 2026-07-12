import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext.jsx';
import { getEvent, toggleTask } from '../../api/events.api.js';
import { STATE, triggerLabel } from './meta.js';
import EventChat from '../messages/EventChat.jsx';

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

            {e.writeup && (
              <section className="mt-5 rounded-2xl border border-line bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">SOP write-up</div>
                <p className="mt-2 text-sm leading-relaxed">{e.writeup}</p>
              </section>
            )}

            {e.attachments?.length > 0 && (
              <section className="mt-4 flex flex-wrap gap-2">
                {e.attachments.map((a) => (
                  <a key={a.id} href={a.url || '#'} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs hover:border-pine">
                    {a.kind === 'pdf' ? '📄' : '🔗'} {a.label}
                  </a>
                ))}
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
                          {t.dueOffset != null ? ` · due +${t.dueOffset}d` : ''}
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
