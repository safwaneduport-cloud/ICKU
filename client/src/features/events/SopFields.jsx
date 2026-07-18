import { useState } from 'react';
import { uploadFile } from '../../api/files.api.js';

// The SOP block shared by New Event and the event drawer: write-up + PDF
// attachments + links. `attachments` is the full list ([{kind,label,url}]) —
// callers always send the whole thing back, so removal just works.
export default function SopFields({ writeup, onWriteup, attachments = [], onAttachments }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const files = attachments.filter((a) => a.kind === 'pdf');
  const links = attachments.filter((a) => a.kind === 'link');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" is over 10MB`); return; }
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
    setBusy(true);
    try {
      const up = await uploadFile(dataUrl, file.name);
      onAttachments([...attachments, { kind: 'pdf', label: file.name, url: up.url }]);
      setErr('');
    } catch (ex) {
      setErr(`Upload failed: ${ex.response?.data?.error?.message || ex.message}`);
    } finally { setBusy(false); }
  }

  function addLink() {
    const url = link.trim();
    if (!url) return;
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    onAttachments([...attachments, { kind: 'link', label: 'SOP link', url: withProto }]);
    setLink('');
    setErr('');
  }

  const remove = (target) => onAttachments(attachments.filter((a) => a !== target));

  return (
    <div>
      <textarea rows={2} value={writeup} onChange={(e) => onWriteup(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2" placeholder="How this project is run…" />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${busy ? 'opacity-60' : 'border-line hover:border-pine'}`}>
          📄 {busy ? 'Uploading…' : 'Attach PDF'}
          <input type="file" accept=".pdf,application/pdf,.doc,.docx" onChange={onFile} className="hidden" disabled={busy} />
        </label>
        <div className="flex min-w-[14rem] flex-1 items-center gap-1">
          <input
            value={link} onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
            placeholder="or paste a link (Google Doc, Drive…)"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-pine" />
          <button type="button" onClick={addLink} disabled={!link.trim()}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-pine disabled:opacity-40">Add</button>
        </div>
      </div>

      {(files.length > 0 || links.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...files, ...links].map((a, i) => (
            <span key={i} className="flex max-w-full items-center gap-1 rounded-full bg-pine-tint px-2 py-0.5 text-xs text-pine">
              <span>{a.kind === 'pdf' ? '📄' : '🔗'}</span>
              <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[12rem] truncate hover:underline">{a.label}</a>
              <button type="button" onClick={() => remove(a)} className="text-pine/60 hover:text-brick" aria-label={`Remove ${a.label}`}>✕</button>
            </span>
          ))}
        </div>
      )}

      {err && <p className="mt-1 text-xs text-brick">{err}</p>}
      <p className="mt-1 text-[11px] text-ink-soft">Anything attached here also appears in the Knowledge Base as an SOP linked to this project.</p>
    </div>
  );
}
