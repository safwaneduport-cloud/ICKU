import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { knowledgeMeta, getDocs, getDoc, createDoc } from '../api/knowledge.api.js';
import { getDepartments } from '../api/departments.api.js';
import { uploadFile } from '../api/files.api.js';

const TYPE_COLOR = { SOP: '#134535', Policy: '#9C3A2A', Guide: '#3F6075', FAQ: '#9A6312', Manual: '#2C7A57' };
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function TypeBadge({ type }) {
  const c = TYPE_COLOR[type] || '#5E635B';
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: c, background: '#F1EFE8' }}>{type}</span>;
}

export default function Knowledge() {
  const meta = useQuery({ queryKey: ['knowledge-meta'], queryFn: knowledgeMeta, retry: false });
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const docs = useQuery({ queryKey: ['knowledge', type, q], queryFn: () => getDocs({ type: type === 'all' ? undefined : type, q: q || undefined }), retry: false });
  const types = ['all', ...(meta.data?.types || [])];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Knowledge Base</h1>
        {meta.data?.canCreate && (
          <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New document</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, body, tags…"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine sm:w-64" />
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`rounded-full px-3 py-1 text-sm ${type === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {docs.isLoading && <p className="text-ink-soft">Loading…</p>}
        {!docs.isLoading && (docs.data || []).length === 0 && <p className="text-ink-soft">No documents found.</p>}
        {(docs.data || []).map((d) => (
          <button key={d.id} onClick={() => setOpenId(d.id)} className="rounded-2xl border border-line bg-white p-4 text-left hover:border-pine">
            <div className="flex items-center justify-between">
              <TypeBadge type={d.type} />
              <span className="text-[11px] text-ink-soft">{fmtDate(d.updatedAt)}</span>
            </div>
            <div className="mt-2 font-medium leading-snug">{d.title}</div>
            <div className="mt-1 text-xs text-ink-soft">{d.owner?.name || '—'} · {d.department?.name || '—'}</div>
            {d.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {d.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-paper px-1.5 py-0.5 text-[10px] text-ink-soft">#{t}</span>)}
              </div>
            )}
          </button>
        ))}
      </div>

      {openId && <DocDrawer id={openId} onClose={() => setOpenId(null)} />}
      {showNew && <NewDocModal types={meta.data?.types || []} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function DocDrawer({ id, onClose }) {
  const q = useQuery({ queryKey: ['knowledge-doc', id], queryFn: () => getDoc(id), retry: false });
  const d = q.data;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-6" onClick={(e) => e.stopPropagation()}>
        {!d ? <p className="text-ink-soft">Loading…</p> : (
          <>
            <div className="flex items-start justify-between">
              <TypeBadge type={d.type} />
              <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm">Close</button>
            </div>
            <h2 className="mt-3 font-serif text-2xl font-bold">{d.title}</h2>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-ink-soft">
              <span>{d.owner?.name || '—'}</span><span>{d.department?.name || '—'}</span><span>Updated {fmtDate(d.updatedAt)}</span><span className="font-mono text-xs">v1.0</span>
            </div>
            {d.body && (
              <p className="mt-5 border-l-4 pl-4 text-sm leading-relaxed" style={{ borderColor: TYPE_COLOR[d.type] }}>{d.body}</p>
            )}
            {d.link && (
              <a href={d.link} target="_blank" rel="noreferrer" className="mt-4 block rounded-lg border border-line bg-white px-3 py-2 text-sm hover:border-pine">🔗 {d.link}</a>
            )}
            {d.linkedEvent && (
              <div className="mt-4 rounded-lg bg-pine-tint px-3 py-2 text-sm text-pine">Linked project · {d.linkedEvent.name}</div>
            )}
            {Array.isArray(d.attachments) && d.attachments.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Attachments</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.attachments.map((a, i) => (
                    a.url
                      ? <a key={i} href={a.url} target="_blank" rel="noreferrer" download={a.label} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs hover:border-pine">{a.kind === 'pdf' ? '📄' : '🔗'} {a.label}</a>
                      : <span key={i} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs">{a.kind === 'pdf' ? '📄' : '🔗'} {a.label}</span>
                  ))}
                </div>
              </div>
            )}
            {d.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {d.tags.map((t) => <span key={t} className="rounded bg-white px-2 py-0.5 text-xs text-ink-soft">#{t}</span>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NewDocModal({ types, onClose }) {
  const qc = useQueryClient();
  const depts = useQuery({ queryKey: ['departments'], queryFn: getDepartments, retry: false });
  const [f, setF] = useState({ title: '', type: types[0] || 'SOP', departmentId: '', body: '', tags: '', link: '' });
  const [attachments, setAttachments] = useState([]); // { kind:'pdf', label, url }
  const [uploading, setUploading] = useState(0);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => createDoc({ ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), attachments }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { alert(`"${file.name}" is larger than 10MB and was skipped.`); continue; }
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      setUploading((n) => n + 1);
      try {
        const up = await uploadFile(dataUrl, file.name);
        setAttachments((a) => [...a, { kind: 'pdf', label: up.name, url: up.url }]);
      } catch (err) {
        alert(`Couldn't upload "${file.name}": ${err.response?.data?.error?.message || err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New document</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">Title</span>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} className="inp mt-1" /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Type</span>
            <select value={f.type} onChange={(e) => set('type', e.target.value)} className="inp mt-1">{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="block text-sm"><span className="text-ink-soft">Department</span>
            <select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} className="inp mt-1">
              <option value="">—</option>{(depts.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>
        </div>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Body</span>
          <textarea rows={4} value={f.body} onChange={(e) => set('body', e.target.value)} className="inp mt-1" placeholder="The knowledge that persists…" /></label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Link <span className="text-xs">(optional)</span></span>
          <input value={f.link} onChange={(e) => set('link', e.target.value)} className="inp mt-1" placeholder="https://docs.google.com/…" /></label>
        <div className="mt-3 text-sm">
          <span className="text-ink-soft">Files <span className="text-xs">(PDF, images — optional)</span></span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs hover:border-pine">
              📎 Attach file
              <input type="file" multiple accept=".pdf,image/*" onChange={onFiles} className="hidden" />
            </label>
            {uploading > 0 && <span className="text-xs text-ink-soft">Uploading {uploading}…</span>}
            {attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg bg-paper px-2 py-1 text-xs">
                📄 <span className="max-w-[140px] truncate">{a.label}</span>
                <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} className="text-ink-soft hover:text-brick">✕</button>
              </span>
            ))}
          </div>
        </div>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Tags <span className="text-xs">(comma-separated)</span></span>
          <input value={f.tags} onChange={(e) => set('tags', e.target.value)} className="inp mt-1" placeholder="results, academics" /></label>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!f.title.trim() || mut.isPending || uploading > 0} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Publish</button>
        </div>
      </div>
    </div>
  );
}
