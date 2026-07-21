import { useRef, useState } from 'react';
import { uploadFile } from '../../api/files.api.js';
import EmojiPicker from './EmojiPicker.jsx';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024; // per-attachment cap

// Slack-style composer: multi-line text, @-mention autocomplete, and
// file/image attachments. Enter sends; Shift+Enter makes a new line.
export default function MessageComposer({ onSend, users = [], placeholder = 'Write a message…', autoFocus = false }) {
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [atts, setAtts] = useState([]);       // { kind, name, url }
  const [mentionIds, setMentionIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(0);
  // mention dropdown state
  const [mq, setMq] = useState(null);          // { query, start } or null
  const [hi, setHi] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);

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

  function insertEmoji(emo) {
    const el = taRef.current;
    const s = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? s;
    setText(text.slice(0, s) + emo + text.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => { el?.focus(); const p = s + emo.length; el?.setSelectionRange(p, p); });
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

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file
    for (const f of files) {
      if (f.size > MAX_BYTES) { alert(`"${f.name}" is larger than ${MAX_MB}MB and was skipped.`); continue; }
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      setUploading((n) => n + 1);
      try {
        const att = await uploadFile(dataUrl, f.name); // → { kind, name, url }
        setAtts((a) => [...a, att]);
      } catch (err) {
        alert(`Couldn't upload "${f.name}": ${err.response?.data?.error?.message || err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function send() {
    const body = text.trim();
    if (!body && atts.length === 0) return;
    setSending(true);
    try {
      await onSend({ body, attachments: atts, mentions: mentionIds });
      setText(''); setAtts([]); setMentionIds([]); setMq(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative rounded-xl border border-line bg-white p-2">
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

      {/* format toolbar */}
      <div className="mb-1 flex items-center gap-0.5">
        <FmtBtn onClick={() => wrapSelection('*')} title="Bold (⌘/Ctrl+B)"><span className="font-bold">B</span></FmtBtn>
        <FmtBtn onClick={() => wrapSelection('_')} title="Italic (⌘/Ctrl+I)"><span className="italic">I</span></FmtBtn>
        <FmtBtn onClick={() => wrapSelection('~')} title="Strikethrough"><span className="line-through">S</span></FmtBtn>
        <FmtBtn onClick={() => wrapSelection('`')} title="Code"><span className="font-mono text-[11px]">{'</>'}</span></FmtBtn>
        <div className="relative">
          <FmtBtn onClick={() => setEmojiOpen((v) => !v)} title="Emoji">😊</FmtBtn>
          {emojiOpen && (
            <div className="absolute bottom-9 left-0 z-30">
              <EmojiPicker onPick={insertEmoji} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Attach a file or image"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft hover:border-pine hover:text-pine"
        >
          📎
        </button>
        <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
        {/* Auto-grow via the CSS grid "replicated content" trick: an invisible
            twin sizes the shared grid cell to the text height (wrapping exactly
            like the textarea), the textarea fills it, and max-h-40 caps growth
            then scrolls. No JS measurement — immune to the flex width/timing
            that made a scrollHeight approach stick tall. */}
        <div className="grid max-h-40 flex-1">
          <div aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words rounded-lg border border-transparent px-3 py-2 text-sm leading-5">
            {text + ' '}
          </div>
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="col-start-1 row-start-1 resize-none overflow-y-auto rounded-lg border border-line px-3 py-2 text-sm leading-5 outline-none focus:border-pine"
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={sending || uploading > 0 || (!text.trim() && atts.length === 0)}
          className="h-9 shrink-0 rounded-lg bg-pine px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <div className="px-1 pt-1 text-[10px] text-ink-soft">
        <span className="font-mono">*bold*</span> · <span className="font-mono">_italic_</span> · <span className="font-mono">@</span> to mention · Enter to send · Shift+Enter for a new line
      </div>
    </div>
  );
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
