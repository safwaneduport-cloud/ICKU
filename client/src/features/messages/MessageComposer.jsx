import { useEffect, useRef, useState } from 'react';
import { uploadFile } from '../../api/files.api.js';
import EmojiPicker from './EmojiPicker.jsx';

const DRAFT_PREFIX = 'icku-draft-';
export const readDraft = (key) => (key ? localStorage.getItem(DRAFT_PREFIX + key) || '' : '');

// Every saved draft as [{ conversationId, text }] — powers the Drafts card.
export const listDrafts = () => {
  const out = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(DRAFT_PREFIX)) {
      const text = localStorage.getItem(k);
      if (text && text.trim()) out.push({ conversationId: k.slice(DRAFT_PREFIX.length), text });
    }
  }
  return out;
};

// Discard a saved draft (Drafts card) and notify the rail to re-render.
export const clearDraft = (key) => {
  if (!key) return;
  localStorage.removeItem(DRAFT_PREFIX + key);
  window.dispatchEvent(new CustomEvent('icku-draftchange'));
};

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024; // per-attachment cap

// Slack-style composer: multi-line text, @-mention autocomplete, and
// file/image attachments. Enter sends; Shift+Enter makes a new line.
export default function MessageComposer({ onSend, users = [], placeholder = 'Write a message…', autoFocus = false, draftKey = null, outbox = false }) {
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const [text, setText] = useState(() => readDraft(draftKey));
  const [atts, setAtts] = useState([]);       // { kind, name, url }
  const [mentionIds, setMentionIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(0);
  // mention dropdown state
  const [mq, setMq] = useState(null);          // { query, start } or null
  const [hi, setHi] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false); // "Aa" reveals the formatting toolbar (Slack-style)

  // Persist the unsent text as a per-conversation draft (localStorage). Deps are
  // [text] only — on a draftKey switch the reload effect below updates text
  // first, so this then writes under the NEW key (no cross-key clobber).
  useEffect(() => {
    if (!draftKey) return;
    if (text) localStorage.setItem(DRAFT_PREFIX + draftKey, text);
    else localStorage.removeItem(DRAFT_PREFIX + draftKey);
    window.dispatchEvent(new CustomEvent('icku-draftchange'));
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching conversations → load that conversation's saved draft.
  useEffect(() => { setText(readDraft(draftKey)); }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap the current selection (or caret) in a formatting marker: * _ ~ `.
  function wrapSelection(mark) {
    const el = taRef.current; if (!el) return;
    const s = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? s;
    const sel = text.slice(s, end);
    setText(text.slice(0, s) + mark + sel + mark + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      if (sel) el.setSelectionRange(s + mark.length, end + mark.length);
      else { const p = s + mark.length; el.setSelectionRange(p, p); }
    });
  }

  // Wrap the selection (or a placeholder) in a [label](url) link.
  function insertLink() {
    const el = taRef.current; if (!el) return;
    const s = el.selectionStart ?? text.length; const end = el.selectionEnd ?? s;
    const sel = text.slice(s, end);
    let url = (window.prompt('Link URL', 'https://') || '').trim();
    if (!url || url === 'https://' || url === 'http://') return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`; // auto-prefix so it renders as a link
    const md = `[${sel || url}](${url})`;
    setText(text.slice(0, s) + md + text.slice(end));
    requestAnimationFrame(() => { el.focus(); const p = s + md.length; el.setSelectionRange(p, p); });
  }
  // Prefix each line in the selection (or the current line) — for lists / quotes.
  function prefixLines(prefix) {
    const el = taRef.current; if (!el) return;
    const s = el.selectionStart ?? 0; const end = el.selectionEnd ?? s;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    const nl = text.indexOf('\n', end); const lineEnd = nl === -1 ? text.length : nl;
    const block = text.slice(lineStart, lineEnd);
    const prefixed = block.split('\n').map((l, i) => (prefix === '1. ' ? `${i + 1}. ${l}` : `${prefix}${l}`)).join('\n');
    setText(text.slice(0, lineStart) + prefixed + text.slice(lineEnd));
    requestAnimationFrame(() => { el.focus(); const p = lineStart + prefixed.length; el.setSelectionRange(p, p); });
  }

  function insertEmoji(emo) {
    const el = taRef.current;
    const s = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? s;
    setText(text.slice(0, s) + emo + text.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => { el?.focus(); const p = s + emo.length; el?.setSelectionRange(p, p); });
  }

  // The "@" button: insert an @ at the caret and open the mention autocomplete.
  // The @ must sit at line-start or after whitespace, or onChange's detector kills
  // the dropdown on the first filter keystroke — so prepend a space mid-word.
  function insertAtMention() {
    const el = taRef.current;
    const s = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? s;
    const needSpace = s > 0 && !/\s/.test(text[s - 1]);
    const ins = (needSpace ? ' ' : '') + '@';
    const at = s + (needSpace ? 1 : 0); // index of the '@'
    setText(text.slice(0, s) + ins + text.slice(end));
    setMq({ query: '', start: at });
    setHi(0);
    requestAnimationFrame(() => { el?.focus(); const p = s + ins.length; el?.setSelectionRange(p, p); });
  }

  // @channel / @all notify everyone in the conversation. They surface at the top
  // of the autocomplete when the query prefixes them.
  const SPECIAL = [
    { id: '@channel', name: 'channel', role: 'Notify everyone here', special: true },
    { id: '@all', name: 'all', role: 'Notify everyone here', special: true },
  ];
  const matches = mq === null
    ? []
    : [
        ...SPECIAL.filter((s) => s.name.startsWith(mq.query.toLowerCase())),
        ...users.filter((u) => u.name.toLowerCase().includes(mq.query.toLowerCase())),
      ].slice(0, 6);

  function onChange(e) {
    const val = e.target.value;
    setText(val);
    // detect an active @mention token ending at the caret
    const caret = e.target.selectionStart;
    const upto = val.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at >= 0) {
      const before = at === 0 ? ' ' : upto[at - 1];
      const token = upto.slice(at + 1);
      if (/\s/.test(before) === false && at !== 0) {
        // '@' must be at start or preceded by whitespace
        setMq(null);
      } else if (/\s/.test(token)) {
        setMq(null);
      } else {
        setMq({ query: token, start: at });
        setHi(0);
      }
    } else {
      setMq(null);
    }
  }

  function pickMention(u) {
    const caret = taRef.current.selectionStart;
    const token = u.special ? u.id : '@' + u.name; // u.id is already "@channel"/"@all"
    const next = text.slice(0, mq.start) + token + ' ' + text.slice(caret);
    setText(next);
    setMentionIds((ids) => (ids.includes(u.id) ? ids : [...ids, u.id]));
    setMq(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function onKeyDown(e) {
    if (mq !== null && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(matches[hi]); return; }
      if (e.key === 'Escape') { setMq(null); return; }
    }
    // Formatting shortcuts (⌘/Ctrl + B / I).
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); wrapSelection('*'); return; }
      if (k === 'i') { e.preventDefault(); wrapSelection('_'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // Upload a set of files (from the picker, a drag-drop, or a paste). Each file's
  // read+upload is guarded so one failure doesn't abort the whole batch.
  async function processFiles(fileList) {
    for (const f of Array.from(fileList || [])) {
      if (f.size > MAX_BYTES) { alert(`"${f.name}" is larger than ${MAX_MB}MB and was skipped.`); continue; }
      setUploading((n) => n + 1);
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const att = await uploadFile(dataUrl, f.name || 'pasted-image.png'); // → { kind, name, url }
        setAtts((a) => [...a, att]);
      } catch (err) {
        alert(`Couldn't attach "${f.name || 'file'}": ${err?.response?.data?.error?.message || err?.message || 'read failed'}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  function onFiles(e) { const list = e.target.files; e.target.value = ''; processFiles(list); }
  // Paste an image straight from the clipboard.
  function onPaste(e) {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); processFiles(files); }
  }
  // Drag-drop onto the composer. A depth counter keeps the overlay from sticking
  // when the pointer moves over child elements (dragleave bubbles from the deepest
  // node); a window drop/dragend listener is a final safety net.
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = () => { dragDepth.current += 1; setDragOver(true); };
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false); };
  function onDrop(e) { e.preventDefault(); dragDepth.current = 0; setDragOver(false); if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files); }
  useEffect(() => {
    const reset = () => { dragDepth.current = 0; setDragOver(false); };
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    return () => { window.removeEventListener('drop', reset); window.removeEventListener('dragend', reset); };
  }, []);

  async function send() {
    if (sending) return; // a fast double-Enter bypasses the disabled Send button
    const body = text.trim();
    if (!body && atts.length === 0) return;
    const payload = { body, attachments: atts, mentions: mentionIds };
    if (outbox) {
      // Optimistic: clear the composer immediately (this empties the draft) and
      // hand delivery to the parent, which renders a sending/failed state + retry.
      setText(''); setAtts([]); setMentionIds([]); setMq(null);
      onSend(payload);
      return;
    }
    setSending(true);
    try {
      await onSend(payload);
      setText(''); setAtts([]); setMentionIds([]); setMq(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative rounded-xl border bg-white p-2 ${dragOver ? 'border-pine ring-2 ring-pine/30' : 'border-line focus-within:border-pine'}`}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-pine-tint/80 text-sm font-medium text-pine">
          Drop files to attach
        </div>
      )}
      {/* @mention autocomplete */}
      {mq !== null && matches.length > 0 && (
        <div className="absolute bottom-full left-2 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-pine-tint' : ''}`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-steel/15 text-[9px] font-semibold text-steel">{initials(u.name)}</span>
              <span className="truncate font-medium">{u.special ? u.id : u.name}</span>
              <span className="ml-auto truncate text-xs text-ink-soft">{u.role}</span>
            </button>
          ))}
        </div>
      )}

      {/* attachment chips */}
      {(atts.length > 0 || uploading > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {uploading > 0 && (
            <span className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink-soft">Uploading {uploading}…</span>
          )}
          {atts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1 text-xs">
              {a.kind === 'image'
                ? <img src={a.url} alt={a.name} className="h-8 w-8 rounded object-cover" />
                : <span>📎</span>}
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button type="button" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))} className="text-ink-soft hover:text-brick">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* formatting toolbar — revealed by the "Aa" button (Slack-style) */}
      {fmtOpen && (
        <div className="mb-1 flex items-center gap-0.5 border-b border-line pb-1">
          <FmtBtn onClick={() => wrapSelection('*')} title="Bold (⌘/Ctrl+B)"><span className="font-bold">B</span></FmtBtn>
          <FmtBtn onClick={() => wrapSelection('_')} title="Italic (⌘/Ctrl+I)"><span className="italic">I</span></FmtBtn>
          <FmtBtn onClick={() => wrapSelection('~')} title="Strikethrough"><span className="line-through">S</span></FmtBtn>
          <FmtBtn onClick={() => wrapSelection('`')} title="Code"><span className="font-mono text-[11px]">{'</>'}</span></FmtBtn>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <FmtBtn onClick={insertLink} title="Link"><span className="text-[13px]">🔗</span></FmtBtn>
          <FmtBtn onClick={() => prefixLines('- ')} title="Bulleted list"><span className="text-base leading-none">•</span></FmtBtn>
          <FmtBtn onClick={() => prefixLines('1. ')} title="Numbered list"><span className="text-[11px] font-semibold">1.</span></FmtBtn>
          <FmtBtn onClick={() => prefixLines('> ')} title="Quote"><span className="text-[13px] font-semibold">❝</span></FmtBtn>
        </div>
      )}

      {/* text input (auto-grow via the CSS grid "replicated content" trick: an
          invisible twin sizes the shared grid cell, the textarea fills it, and
          max-h-40 caps growth then scrolls — no JS measurement). */}
      <div className="grid max-h-40">
        <div aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words px-1.5 py-1.5 text-sm leading-5">
          {text + ' '}
        </div>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="col-start-1 row-start-1 resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-sm leading-5 outline-none"
        />
      </div>

      {/* action row (Slack-style): + Aa 😊 @ … send arrow */}
      <div className="mt-1 flex items-center gap-0.5">
        <IconBtn onClick={() => fileRef.current?.click()} title="Attach a file or image"><PlusIcon /></IconBtn>
        <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
        <IconBtn onClick={() => setFmtOpen((v) => !v)} title="Formatting" active={fmtOpen}><span className="text-[15px] font-semibold leading-none">Aa</span></IconBtn>
        <div className="relative">
          <IconBtn onClick={() => setEmojiOpen((v) => !v)} title="Emoji"><span className="text-[15px] leading-none">😊</span></IconBtn>
          {emojiOpen && (
            <div className="absolute bottom-10 left-0 z-30">
              <EmojiPicker onPick={insertEmoji} />
            </div>
          )}
        </div>
        <IconBtn onClick={insertAtMention} title="Mention someone"><span className="text-[15px] leading-none">@</span></IconBtn>
        <div className="flex-1" />
        <button
          type="button"
          onClick={send}
          disabled={sending || uploading > 0 || (!text.trim() && atts.length === 0)}
          title="Send"
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-pine hover:bg-pine-tint disabled:text-ink-soft/40 disabled:hover:bg-transparent"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

// Composer action-row icon button (attach / Aa / emoji / mention).
function IconBtn({ onClick, title, active, children }) {
  return (
    <button type="button" title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-paper hover:text-pine ${active ? 'bg-pine-tint text-pine' : ''}`}>
      {children}
    </button>
  );
}

function PlusIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>);
}
function SendIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>);
}

// A compact formatting-toolbar button. onMouseDown+preventDefault keeps the
// textarea's selection intact so the wrap applies to the highlighted text.
function FmtBtn({ onClick, title, children }) {
  return (
    <button type="button" title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="flex h-7 w-7 items-center justify-center rounded text-sm text-ink-soft hover:bg-paper hover:text-pine">
      {children}
    </button>
  );
}
