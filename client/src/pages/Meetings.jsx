import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { useProfile } from '../store/ProfileContext.jsx';
import { getUsers } from '../api/users.api.js';
import { meetingsMeta, getMeetings, getMeeting, createMeeting, updateMinutes, addMeetingAction, toggleMeetingAction } from '../api/collab.api.js';
import AssignPicker from '../features/events/AssignPicker.jsx';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export default function Meetings() {
  const meta = useQuery({ queryKey: ['meetings-meta'], queryFn: meetingsMeta, retry: false });
  const [scope, setScope] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const list = useQuery({ queryKey: ['meetings', scope], queryFn: () => getMeetings(scope), retry: false });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Meetings</h1>
        {meta.data?.canCreate && <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New meeting</button>}
      </div>

      <div className="flex gap-2">
        {[['all', 'All'], ['mine', 'My meetings']].map(([s, label]) => (
          <button key={s} onClick={() => setScope(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${scope === s ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.isLoading && <p className="text-ink-soft">Loading…</p>}
        {!list.isLoading && (list.data || []).length === 0 && <p className="text-ink-soft">No meetings.</p>}
        {(list.data || []).map((m) => (
          <button key={m.id} onClick={() => setOpenId(m.id)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left hover:border-pine">
            <div className="w-16 shrink-0 text-center">
              <div className="text-sm font-semibold">{fmtDate(m.date).split(' ').slice(1).join(' ')}</div>
              <div className="text-xs text-ink-soft">{m.time}</div>
            </div>
            <div className="flex-1">
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-ink-soft">{m.owner.name} · chair · {m.attendeeCount} attendees</div>
            </div>
            <span className="rounded bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">{m.recurring}</span>
          </button>
        ))}
      </div>

      {openId && <MeetingDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewMeetingModal recurrences={meta.data?.recurrences || []} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function MeetingDrawer({ id, onClose }) {
  const { user } = useAuth();
  const { openProfile } = useProfile();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meeting', id], queryFn: () => getMeeting(id), retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const nameOf = Object.fromEntries((users.data || []).map((u) => [u.id, u.name]));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['meeting', id] });
  const saveMinutes = useMutation({ mutationFn: (minutes) => updateMinutes(id, minutes), onSuccess: invalidate });
  const toggle = useMutation({ mutationFn: (actionId) => toggleMeetingAction(id, actionId), onSuccess: invalidate });
  const addAction = useMutation({ mutationFn: (text) => addMeetingAction(id, text), onSuccess: invalidate });
  const [newAction, setNewAction] = useState('');

  const m = q.data;
  const canEdit = m && (m.ownerId === user?.id || m.attendees.some((a) => a.id === user?.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-6" onClick={(e) => e.stopPropagation()}>
        {!m ? <p className="text-ink-soft">Loading…</p> : (
          <>
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">{m.recurring}</span>
                {m.mode && <span className="rounded bg-pine-tint px-2 py-0.5 text-xs font-medium capitalize text-pine">{m.mode === 'offline' ? '🏢 Offline' : m.mode === 'online' ? '💻 Online' : '🔀 Hybrid'}</span>}
              </div>
              <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm">Close</button>
            </div>
            <h2 className="mt-3 font-serif text-2xl font-bold">{m.title}</h2>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-soft">
              <span>{fmtDate(m.date)}</span><span>{m.time}</span><span>{m.owner.name} · chair</span>
            </div>
            {m.meetingLink && (
              <a href={m.meetingLink} target="_blank" rel="noreferrer"
                className="mt-3 flex w-fit items-center gap-2 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                🔗 Join meeting
              </a>
            )}

            <section className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Attendees · {m.attendees.length}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attendees.map((a) => (
                  <button key={a.id} onClick={() => openProfile(a.id)} className="flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-xs transition hover:border-pine">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine text-[10px] font-semibold text-white">{initials(a.name)}</span>
                    {a.name}
                  </button>
                ))}
              </div>
            </section>

            {m.agenda.length > 0 && (
              <section className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Agenda</div>
                <ol className="mt-2 space-y-1.5">
                  {m.agenda.map((a, i) => (
                    <li key={i} className="flex gap-3 text-sm"><span className="font-mono text-xs text-ink-soft">{i + 1}</span>{a}</li>
                  ))}
                </ol>
              </section>
            )}

            <section className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Minutes</div>
              {canEdit ? (
                <textarea defaultValue={m.minutes} rows={3} placeholder="Add meeting minutes…"
                  onBlur={(e) => { if (e.target.value !== m.minutes) saveMinutes.mutate(e.target.value); }}
                  className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine" />
              ) : (
                <p className="mt-2 text-sm text-ink-soft">{m.minutes || 'No minutes yet.'}</p>
              )}
            </section>

            <section className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Action items</div>
              <div className="mt-2 space-y-1.5">
                {m.actions.length === 0 && <p className="text-sm text-ink-soft">No action items.</p>}
                {m.actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <button onClick={() => canEdit && toggle.mutate(a.id)} disabled={!canEdit}
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${a.done ? 'border-sage bg-sage text-white' : 'border-line'}`}>{a.done ? '✓' : ''}</button>
                    <span className={`flex-1 text-sm ${a.done ? 'text-ink-soft line-through' : ''}`}>{a.text}</span>
                    {a.ownerId && <span className="text-xs text-ink-soft">{nameOf[a.ownerId] || a.ownerId}</span>}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <input value={newAction} onChange={(e) => setNewAction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && newAction.trim()) { addAction.mutate(newAction.trim()); setNewAction(''); } }}
                    placeholder="Add an action item…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function NewMeetingModal({ recurrences, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', date: '', time: '10:00', recurring: 'One-off', mode: 'offline', meetingLink: '', attendeeIds: [], agenda: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => createMeeting({ ...f, agenda: f.agenda.split('\n').map((a) => a.trim()).filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      {/* header / scrolling body / footer — Schedule stays put however long the form gets */}
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-line px-6 pb-3 pt-6">
          <h3 className="font-serif text-lg font-semibold">New meeting</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
        <label className="block text-sm"><span className="text-ink-soft">Title</span>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} className="inp mt-1" /></label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Date</span>
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className="inp mt-1" /></label>
          <label className="block text-sm"><span className="text-ink-soft">Time</span>
            <input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className="inp mt-1" /></label>
          <label className="block text-sm"><span className="text-ink-soft">Recurs</span>
            <select value={f.recurring} onChange={(e) => set('recurring', e.target.value)} className="inp mt-1">{recurrences.map((r) => <option key={r}>{r}</option>)}</select></label>
        </div>
        <div className="mt-3 text-sm">
          <span className="text-ink-soft">Mode</span>
          <div className="mt-1 flex gap-2">
            {['offline', 'online', 'hybrid'].map((mo) => (
              <button key={mo} type="button" onClick={() => set('mode', mo)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${f.mode === mo ? 'border-pine bg-pine text-white' : 'border-line text-ink-soft hover:border-pine'}`}>
                {mo}
              </button>
            ))}
          </div>
        </div>
        {f.mode !== 'offline' && (
          <label className="mt-3 block text-sm"><span className="text-ink-soft">Meeting link</span>
            <input value={f.meetingLink} onChange={(e) => set('meetingLink', e.target.value)} className="inp mt-1" placeholder="Paste the Zoom / Teams / Meet link" /></label>
        )}
        <div className="mt-3 text-sm"><span className="text-ink-soft">Attendees</span>
          <div className="mt-1"><AssignPicker value={f.attendeeIds} onChange={(arr) => set('attendeeIds', arr)} /></div>
        </div>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Agenda <span className="text-xs">(one per line)</span></span>
          <textarea rows={3} value={f.agenda} onChange={(e) => set('agenda', e.target.value)} className="inp mt-1" /></label>
        {mut.error && <p className="mt-3 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-white px-6 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!f.title.trim() || !f.date || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Schedule</button>
        </div>
      </div>
    </div>
  );
}
