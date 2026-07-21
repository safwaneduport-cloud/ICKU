import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext.jsx';
import { reactMessage, editMessage, deleteMessage, createReminder } from '../../api/messages.api.js';
import EmojiPicker from './EmojiPicker.jsx';

const QUICK = ['👍', '✅', '🎉', '❤️', '😂', '👀'];
const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// "Due in 1 hour" / "Due in 20 min" / "Due in 2 days" for a reminder banner.
function dueIn(at) {
  const ms = new Date(at) - Date.now();
  if (ms <= 0) return 'now';
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr} hour${hr === 1 ? '' : 's'}`;
  const d = Math.round(hr / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

function remindOptions() {
  const now = new Date();
  const at = (ms) => new Date(now.getTime() + ms);
  const tomorrow9 = () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
  const nextWeek9 = () => { const d = new Date(now); const add = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0); return d; };
  return [
    ['In 20 minutes', at(20 * 60e3)],
    ['In 1 hour', at(60 * 60e3)],
    ['In 3 hours', at(3 * 60 * 60e3)],
    ['Tomorrow', tomorrow9()],
    ['Next week', nextWeek9()],
  ];
}

// Lightweight inline formatting (Slack-style, non-nested): *bold*, _italic_,
// ~strike~, `code`, and @mentions. One regex tokenises the string; each token
// maps to an element. Deliberately simple — no external markdown library.
const RICH = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|@[\p{L}][\p{L}0-9._-]*)/gu;
function renderBody(body) {
  return body.split(RICH).map((p, i) => {
    if (!p) return null;
    const inner = p.slice(1, -1);
    if (p[0] === '@') return <span key={i} className="rounded bg-pine-tint px-0.5 font-medium text-pine">{p}</span>;
    if (p.length > 2 && p[0] === '*' && p.endsWith('*')) return <strong key={i}>{inner}</strong>;
    if (p.length > 2 && p[0] === '_' && p.endsWith('_')) return <em key={i}>{inner}</em>;
    if (p.length > 2 && p[0] === '~' && p.endsWith('~')) return <span key={i} className="line-through">{inner}</span>;
    if (p.length > 2 && p[0] === '`' && p.endsWith('`')) return <code key={i} className="rounded bg-paper px-1 font-mono text-[13px]">{inner}</code>;
    return <span key={i}>{p}</span>;
  });
}

// Slack-style message row: avatar + name + time on the first of a run, hover
// action toolbar (quick reactions / reply / more), reactions below, inline edit.
export default function ChatMessage({ m, conversationId, compact, reminderAt, onOpenThread, onOpenProfile, onChanged, onRemind }) {
  const { user } = useAuth();
  const mine = user?.id === m.authorId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef(null);

  const changed = () => onChanged?.();
  const react = useMutation({ mutationFn: (emoji) => reactMessage(m.id, emoji), onSuccess: changed });
  const edit = useMutation({ mutationFn: (body) => editMessage(m.id, body), onSuccess: () => { setEditing(false); changed(); } });
  const del = useMutation({ mutationFn: () => deleteMessage(m.id), onSuccess: changed });
  const remind = useMutation({
    mutationFn: (remindAt) => createReminder({ messageId: m.id, conversationId, remindAt: remindAt.toISOString() }),
    onSuccess: (r) => { setMenuOpen(false); setRemindOpen(false); onRemind?.(r); },
  });

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setMenuOpen(false); setRemindOpen(false); setPickerOpen(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen, pickerOpen]);

  const copyText = () => { navigator.clipboard?.writeText(m.body); setMenuOpen(false); };
  const copyLink = () => { navigator.clipboard?.writeText(`${window.location.origin}/messages#msg-${m.id}`); setMenuOpen(false); };

  return (
    <div id={`msg-${m.id}`} className="group relative flex gap-2 px-4 py-0.5 hover:bg-paper/60">
      {/* gutter: avatar (first of run) or hover-time (grouped) */}
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="mt-1 hidden w-9 text-right text-[10px] leading-5 text-ink-soft group-hover:inline-block">{timeOf(m.at)}</span>
        ) : (
          <button onClick={() => onOpenProfile?.(m.authorId)} title="View profile"
            className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-pine text-[11px] font-semibold text-white">
            {initials(m.author)}
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {reminderAt && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-steel">
            🔖 Saved for later · Due {dueIn(reminderAt)}
          </div>
        )}
        {!compact && (
          <div className="flex items-baseline gap-2">
            <button onClick={() => onOpenProfile?.(m.authorId)} className="text-sm font-semibold text-ink hover:underline">{m.author}</button>
            <span className="text-[11px] text-ink-soft">{timeOf(m.at)}</span>
          </div>
        )}

        {m.deleted ? (
          <p className="text-sm italic text-ink-soft">This message was deleted.</p>
        ) : editing ? (
          <div className="mt-0.5">
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft.trim()) edit.mutate(draft); } if (e.key === 'Escape') { setEditing(false); setDraft(m.body); } }}
              className="w-full rounded-lg border border-pine px-3 py-2 text-sm outline-none" />
            <div className="mt-1 flex gap-2 text-xs">
              <button onClick={() => { setEditing(false); setDraft(m.body); }} className="rounded-lg border border-line px-3 py-1">Cancel</button>
              <button onClick={() => draft.trim() && edit.mutate(draft)} disabled={edit.isPending} className="rounded-lg bg-pine px-3 py-1 font-medium text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        ) : (
          <>
            {m.body && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {renderBody(m.body)}
                {m.editedAt && <span className="ml-1 text-[10px] text-ink-soft">(edited)</span>}
              </p>
            )}
            {m.attachments?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {m.attachments.map((a, i) => a.kind === 'image' ? (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-48 rounded-lg object-cover" /></a>
                ) : (
                  <a key={i} href={a.url} download={a.name} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-pine hover:border-pine">
                    <span>📎</span><span className="max-w-[180px] truncate">{a.name}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        {/* reactions */}
        {m.reactions?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button key={r.emoji} onClick={() => react.mutate(r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${r.mine ? 'border-pine bg-pine-tint text-pine' : 'border-line bg-white text-ink-soft hover:border-pine'}`}>
                <span>{r.emoji}</span><span className="font-medium">{r.count}</span>
              </button>
            ))}
            <button onClick={() => setPickerOpen((v) => !v)} className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink-soft hover:border-pine" title="Add reaction">＋</button>
          </div>
        )}

        {/* thread affordance */}
        {onOpenThread && m.replyCount > 0 && (
          <button onClick={() => onOpenThread(m)} className="mt-1 flex items-center gap-1 text-xs font-medium text-steel hover:underline">
            💬 {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
            {m.lastReplyAt && <span className="text-ink-soft">· last reply {timeOf(m.lastReplyAt)}</span>}
          </button>
        )}
      </div>

      {/* hover action toolbar */}
      {!m.deleted && !editing && (
        <div ref={menuRef} className={`absolute -top-3 right-3 z-10 items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-sm ${menuOpen || pickerOpen ? 'flex' : 'hidden group-hover:flex'}`}>
          {QUICK.slice(0, 3).map((e) => (
            <button key={e} onClick={() => react.mutate(e)} className="rounded px-1 text-sm hover:bg-paper" title={`React ${e}`}>{e}</button>
          ))}
          <button onClick={() => setPickerOpen((v) => !v)} className="rounded px-1 text-sm text-ink-soft hover:bg-paper" title="Add reaction">😀</button>
          {onOpenThread && (
            <button onClick={() => onOpenThread(m)} className="rounded px-1.5 text-sm text-ink-soft hover:bg-paper" title="Reply in thread">💬</button>
          )}
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded px-1.5 text-base text-ink-soft hover:bg-paper" title="More actions">⋮</button>

          {/* emoji picker popover */}
          {pickerOpen && (
            <div className="absolute right-0 top-8 z-20">
              <EmojiPicker onPick={(e) => { react.mutate(e); setPickerOpen(false); }} />
            </div>
          )}

          {/* more menu */}
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-lg border border-line bg-white py-1 text-sm shadow-lg">
              {mine && <MenuItem icon="✏️" label="Edit message" onClick={() => { setEditing(true); setMenuOpen(false); }} />}
              <MenuItem icon="🔗" label="Copy link" onClick={copyLink} />
              {m.body && <MenuItem icon="📋" label="Copy text" onClick={copyText} />}
              <button onClick={() => setRemindOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-paper">
                <span className="flex items-center gap-2"><span>⏰</span>Remind me</span><span className="text-ink-soft">›</span>
              </button>
              {remindOpen && (
                <div className="border-y border-line bg-paper/50">
                  {remindOptions().map(([label, when]) => (
                    <button key={label} onClick={() => remind.mutate(when)} className="block w-full px-6 py-1.5 text-left text-[13px] hover:bg-white">{label}</button>
                  ))}
                </div>
              )}
              {mine && (
                <>
                  <div className="my-1 h-px bg-line" />
                  <MenuItem icon="🗑" label="Delete message" danger onClick={() => { if (confirm('Delete this message?')) del.mutate(); setMenuOpen(false); }} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-paper ${danger ? 'text-brick' : 'text-ink'}`}>
      <span>{icon}</span>{label}
    </button>
  );
}
