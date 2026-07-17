import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { announcementsMeta, getAnnouncements, createAnnouncement, ackAnnouncement } from '../api/announcements.api.js';

const SCOPE_COLOR = { Organization: '#134535', Academics: '#3F6075', Growth: '#9A6312', Technology: '#2C7A57', Operations: '#9C3A2A' };
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function Announcements() {
  const meta = useQuery({ queryKey: ['ann-meta'], queryFn: announcementsMeta, retry: false });
  const [scope, setScope] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const list = useQuery({ queryKey: ['announcements', scope], queryFn: () => getAnnouncements(scope), retry: false });
  const ack = useMutation({ mutationFn: ackAnnouncement, onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }) });

  const scopes = ['all', ...(meta.data?.scopes || [])];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Announcements</h1>
        {meta.data?.canPost && (
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New announcement</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {scopes.map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`rounded-full px-3 py-1 text-sm ${scope === s ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.isLoading && <p className="text-ink-soft">Loading…</p>}
        {!list.isLoading && (list.data || []).length === 0 && <p className="text-ink-soft">No announcements.</p>}
        {(list.data || []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: SCOPE_COLOR[a.scope] || '#5E635B', background: '#F1EFE8' }}>{a.scope}</span>
              <span className="text-xs text-ink-soft">{fmtDate(a.createdAt)}</span>
            </div>
            <h3 className="mt-2 font-serif text-lg font-semibold">{a.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{a.body}</p>
            <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-sm">
              <span className="text-ink-soft">{a.author.name}</span>
              <span className="text-ink-soft">{a.ackCount} acknowledged</span>
              <button onClick={() => ack.mutate(a.id)}
                className={`ml-auto rounded-lg px-3 py-1.5 text-sm font-medium ${a.acknowledged ? 'bg-sage-tint text-sage' : 'border border-line hover:border-pine'}`}>
                {a.acknowledged ? '✓ Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewAnnouncementModal scopes={meta.data?.scopes || []} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewAnnouncementModal({ scopes, onClose }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState(scopes[0] || 'Organization');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const mut = useMutation({
    mutationFn: () => createAnnouncement({ scope, title: title.trim(), body: body.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New announcement</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">Scope</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="inp mt-1">{scopes.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="inp mt-1" /></label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Body</span>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="inp mt-1" placeholder="What do you want to announce?" /></label>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!title.trim() || !body.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Post</button>
        </div>
      </div>
    </div>
  );
}
