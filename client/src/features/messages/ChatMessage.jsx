import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext.jsx';
import { reactMessage, editMessage, deleteMessage, createReminder, markUnread, pinMessage, unpinMessage } from '../../api/messages.api.js';
import EmojiPicker from './EmojiPicker.jsx';
import Avatar from './Avatar.jsx';

const QUICK = ['👍', '✅', '🎉', '❤️', '😂', '👀'];
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

// Lightweight formatting (Slack-style, non-nested), no external markdown library.
// Inline: *bold* _italic_ ~strike~ `code`, @mentions, [label](url) and bare URLs.
const INLINE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|@[\p{L}][\p{L}0-9._-]*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+)/gu;
const LINK_MD = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;
function renderInline(text, k) {
  return String(text).split(INLINE).map((p, i) => {
    if (!p) return null;
    const key = `${k}.${i}`;
    if (p[0] === '@') return <span key={key} className="rounded bg-pine-tint px-0.5 font-medium text-pine">{p}</span>;
    const md = p.match(LINK_MD);
    if (md) return <a key={key} href={md[2]} target="_blank" rel="noreferrer" className="text-pine underline underline-offset-2 hover:text-sage">{md[1]}</a>;
    if (/^https?:\/\//.test(p)) return <a key={key} href={p} target="_blank" rel="noreferrer" className="break-all text-pine underline underline-offset-2 hover:text-sage">{p}</a>;
    const inner = p.slice(1, -1);
    if (p.length > 2 && p[0] === '*' && p.endsWith('*')) return <strong key={key}>{inner}</strong>;
    if (p.length > 2 && p[0] === '_' && p.endsWith('_')) return <em key={key}>{inner}</em>;
    if (p.length > 2 && p[0] === '~' && p.endsWith('~')) return <span key={key} className="line-through">{inner}</span>;
    if (p.length > 2 && p[0] === '`' && p.endsWith('`')) return <code key={key} className="rounded bg-paper px-1 font-mono text-[13px]">{inner}</code>;
    return <span key={key}>{p}</span>;
  });
}
// Block markdown (only used when a message actually contains it — see below):
// > quote, - / * bullets, 1. numbered lists. Plain messages keep the simpler path.
const hasBlockMarkdown = (body = '') => body.split('\n').some((l) => /^(>\s?|[-*]\s+|\d+\.\s+)/.test(l));
function renderBlocks(body = '') {
  const lines = body.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^>\s?/.test(lines[i])) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      out.push(<blockquote key={`bq${i}`} className="my-0.5 border-l-2 border-line pl-3 text-ink-soft">{q.map((t, j) => <div key={j} className="whitespace-pre-wrap break-words">{renderInline(t, `bq${i}.${j}`)}</div>)}</blockquote>);
    } else if (/^[-*]\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i += 1; }
      out.push(<ul key={`ul${i}`} className="my-0.5 list-disc pl-5">{items.map((t, j) => <li key={j} className="break-words">{renderInline(t, `ul${i}.${j}`)}</li>)}</ul>);
    } else if (/^\d+\.\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i += 1; }
      out.push(<ol key={`ol${i}`} className="my-0.5 list-decimal pl-5">{items.map((t, j) => <li key={j} className="break-words">{renderInline(t, `ol${i}.${j}`)}</li>)}</ol>);
    } else {
      out.push(<div key={`ln${i}`} className="min-h-[1.2em] whitespace-pre-wrap break-words">{renderInline(lines[i], `ln${i}`)}</div>);
      i += 1;
    }
  }
  return out;
}

// Slack-style message row: avatar + name + time on the first of a run, hover
// action toolbar (quick reactions / reply / more), reactions below, inline edit.
export default function ChatMessage({ m, conversationId, compact, reminderAt, onOpenThread, onOpenProfile, onForward, onChanged, onPatch, onRemind }) {
  const { user } = useAuth();
  const mine = user?.id === m.authorId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef(null);

  const changed = () => onChanged?.();
  // The recent-page poll only refreshes the most recent messages, so an edit /
  // reaction / delete on a message the reader scrolled up to (outside that page)
  // wouldn't otherwise reflect. onPatch applies the server's result to the loaded
  // set by id, so backlog messages update in place (and a delete stops rendering
  // its body/attachments immediately — important for a soft-deleted message).
  const patch = (partial) => onPatch?.(partial);
  const react = useMutation({ mutationFn: (emoji) => reactMessage(m.id, emoji), onSuccess: (reactions) => { patch({ id: m.id, reactions }); changed(); } });
  const edit = useMutation({ mutationFn: (body) => editMessage(m.id, body), onSuccess: (updated) => { setEditing(false); patch(updated); changed(); } });
  const del = useMutation({ mutationFn: () => deleteMessage(m.id), onSuccess: () => { patch({ id: m.id, deleted: true, body: '', attachments: [], reactions: [] }); changed(); } });
  const pin = useMutation({ mutationFn: () => (m.pinnedAt ? unpinMessage(m.id) : pinMessage(m.id)), onSuccess: (updated) => { patch(updated); changed(); } });
  const remind = useMutation({
    mutationFn: (remindAt) => createReminder({ messageId: m.id, conversationId, remindAt: remindAt.toISOString() }),
    onSuccess: (r) => { setMenuOpen(false); setRemindOpen(false); onRemind?.(r); },
  });
  const qc = useQueryClient();
  const unread = useMutation({
    mutationFn: () => markUnread(conversationId, m.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      // keep the frozen "New messages" marker in sync so the divider lands here on reopen
      qc.setQueryData(['conversation', conversationId], (old) => (old ? { ...old, lastReadAt: new Date(new Date(m.at).getTime() - 1).toISOString() } : old));
    },
  });
  const [confirmDel, setConfirmDel] = useState(false); // styled delete confirmation

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setMenuOpen(false); setRemindOpen(false); setPickerOpen(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen, pickerOpen]);

  // ── Mobile: there's no hover on touch, so a long-press opens a bottom action
  // sheet (Slack-style) with the same reactions + actions as the hover toolbar. ──
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetRemind, setSheetRemind] = useState(false);
  const [sheetPicker, setSheetPicker] = useState(false);
  const pressTimer = useRef(null);
  const didLong = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });
  const openedAt = useRef(0); // when the sheet opened — guards its backdrop from the long-press ghost click
  const startPress = (e) => {
    if (m.deleted || editing || sheetOpen || confirmDel) return; // don't arm while an overlay is up
    const t = e.touches?.[0];
    pressPos.current = { x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
    didLong.current = false;
    pressTimer.current = setTimeout(() => { didLong.current = true; openedAt.current = Date.now(); setSheetOpen(true); navigator.vibrate?.(8); }, 480);
  };
  // Cancel only past a ~10px slop threshold (real fingers jitter during a hold);
  // a bare touchcancel (no active touch) always cancels.
  const movePress = (e) => {
    const t = e.touches?.[0];
    if (t && Math.abs(t.clientX - pressPos.current.x) <= 10 && Math.abs(t.clientY - pressPos.current.y) <= 10) return;
    clearTimeout(pressTimer.current);
  };
  const endPress = (e) => { clearTimeout(pressTimer.current); if (didLong.current) e.preventDefault(); };
  // The Android ghost click (touchend preventDefault doesn't cancel it there) now
  // lands on the sheet's full-screen backdrop, which ignores clicks within 500ms of
  // opening (openedAt). We deliberately do NOT swallow it via an onClickCapture on
  // the row: React portal events still bubble through the row's fiber ancestors, so
  // such a capture handler would eat the FIRST tap on every sheet button.
  const closeSheet = () => { setSheetOpen(false); setSheetRemind(false); setSheetPicker(false); didLong.current = false; };
  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const copyText = () => { navigator.clipboard?.writeText(m.body); setMenuOpen(false); };
  const copyLink = () => { navigator.clipboard?.writeText(`${window.location.origin}/messages?c=${conversationId}&m=${m.id}`); setMenuOpen(false); };

  return (
    <div id={`msg-${m.id}`}
      onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={movePress} onTouchCancel={movePress}
      className="group relative flex gap-2 px-4 py-0.5 hover:bg-paper/60 [-webkit-touch-callout:none]">
      {/* gutter: avatar (first of run) or hover-time (grouped) */}
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="mt-1 hidden w-9 text-right text-[10px] leading-5 text-ink-soft group-hover:inline-block">{timeOf(m.at)}</span>
        ) : (
          <button onClick={() => onOpenProfile?.(m.authorId)} title="View profile" className="mt-1 block">
            <Avatar id={m.authorId} name={m.author} photoUrl={m.authorPhoto} size={36} />
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

        {m.pinnedAt && !m.deleted && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-steel">📌 Pinned</div>
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
              hasBlockMarkdown(m.body) ? (
                <div className="text-sm leading-relaxed text-ink">
                  {renderBlocks(m.body)}
                  {m.editedAt && <span className="text-[10px] text-ink-soft">(edited)</span>}
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                  {renderInline(m.body, 'b')}
                  {m.editedAt && <span className="ml-1 text-[10px] text-ink-soft">(edited)</span>}
                </p>
              )
            )}
            {m.attachments?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {m.attachments.map((a, i) => {
                  if (a.kind === 'forward') {
                    return (
                      <div key={i} className="w-full rounded-lg border border-line bg-paper/40 px-3 py-2 text-sm">
                        <div className="mb-0.5 text-[11px] font-medium text-ink-soft">↪ Forwarded{a.source ? ` from ${a.source}` : ''}</div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-ink">{a.author}</span>
                          {a.at && <span className="text-[10px] text-ink-soft">{timeOf(a.at)}</span>}
                        </div>
                        {a.body && <p className="whitespace-pre-wrap break-words text-ink">{renderInline(a.body, `fwd${i}`)}</p>}
                      </div>
                    );
                  }
                  return a.kind === 'image' ? (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-48 rounded-lg object-cover" /></a>
                  ) : (
                    <a key={i} href={a.url} download={a.name} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-pine hover:border-pine">
                      <span>📎</span><span className="max-w-[180px] truncate">{a.name}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* reactions */}
        {m.reactions?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button key={r.emoji} onClick={() => react.mutate(r.emoji)}
                title={r.who?.length ? `${r.who.join(', ')} reacted with ${r.emoji}` : undefined}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${r.mine ? 'border-pine bg-pine-tint text-pine' : 'border-line bg-white text-ink-soft hover:border-pine'}`}>
                <span>{r.emoji}</span><span className="font-medium">{r.count}</span>
              </button>
            ))}
            <button onClick={() => setPickerOpen((v) => !v)} className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink-soft hover:border-pine" title="Add reaction">＋</button>
          </div>
        )}

        {/* thread affordance — Slack-style: a stack of replier avatars, the reply
            count as a link, then the last-reply time */}
        {onOpenThread && m.replyCount > 0 && (
          <button onClick={() => onOpenThread(m)} className="group/th mt-1 flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-xs hover:border-line hover:bg-paper">
            {(m.replyAuthors?.length > 0) && (
              <span className="flex -space-x-1.5">
                {m.replyAuthors.map((a) => (
                  <Avatar key={a.id} id={a.id} name={a.name} photoUrl={a.photoUrl} size={20} rounded="rounded-md" className="ring-2 ring-white" />
                ))}
              </span>
            )}
            <span className="font-semibold text-steel group-hover/th:underline">{m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}</span>
            {m.lastReplyAt && <span className="font-normal text-ink-soft">Last reply {timeOf(m.lastReplyAt)}</span>}
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
              {!m.parentId && <MenuItem icon="🔗" label="Copy link" onClick={copyLink} />}
              {!m.parentId && <MenuItem icon="📌" label={m.pinnedAt ? 'Unpin from conversation' : 'Pin to conversation'} onClick={() => { setMenuOpen(false); pin.mutate(); }} />}
              {onForward && <MenuItem icon="↪️" label="Forward" onClick={() => { setMenuOpen(false); onForward(m); }} />}
              {m.body && <MenuItem icon="📋" label="Copy text" onClick={copyText} />}
              {!mine && <MenuItem icon="👁" label="Mark unread" onClick={() => { unread.mutate(); setMenuOpen(false); }} />}
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
                  <MenuItem icon="🗑" label="Delete message" danger onClick={() => { setMenuOpen(false); setConfirmDel(true); }} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* mobile long-press action sheet — portaled to <body> so the message row's
          ghost-click swallower (onClickCapture) can't intercept sheet-button taps.
          The backdrop ignores clicks in the first 500ms (the long-press ghost click). */}
      {sheetOpen && !m.deleted && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40" onClick={(e) => { if (Date.now() - openedAt.current < 500) return; closeSheet(); }}>
          <div className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            {sheetPicker ? (
              <div>
                <button onClick={() => setSheetPicker(false)} className="mb-1 flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-ink-soft hover:text-pine">‹ Back</button>
                <EmojiPicker onPick={(e) => { react.mutate(e); closeSheet(); }} />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-around px-1 py-2">
                  {QUICK.map((e) => (
                    <button key={e} onClick={() => { react.mutate(e); closeSheet(); }} className="text-[26px] leading-none active:scale-90">{e}</button>
                  ))}
                  <button onClick={() => setSheetPicker(true)} title="More reactions" className="flex h-9 w-9 items-center justify-center rounded-full bg-paper text-lg text-ink-soft">＋</button>
                </div>
                <div className="my-1 h-px bg-line" />
                {onOpenThread && <SheetItem icon="💬" label="Reply in thread" onClick={() => { closeSheet(); onOpenThread(m); }} />}
                <SheetItem icon="⏰" label="Remind me" chevron onClick={() => setSheetRemind((v) => !v)} />
                {sheetRemind && (
                  <div className="mb-1 rounded-xl bg-paper/60">
                    {remindOptions().map(([label, when]) => (
                      <button key={label} onClick={() => { remind.mutate(when); closeSheet(); }} className="block w-full px-11 py-2.5 text-left text-[14px] hover:bg-white">{label}</button>
                    ))}
                  </div>
                )}
                {onForward && <SheetItem icon="↪️" label="Forward" onClick={() => { closeSheet(); onForward(m); }} />}
                {!m.parentId && <SheetItem icon="📌" label={m.pinnedAt ? 'Unpin from conversation' : 'Pin to conversation'} onClick={() => { closeSheet(); pin.mutate(); }} />}
                {m.body && <SheetItem icon="📋" label="Copy text" onClick={() => { copyText(); closeSheet(); }} />}
                {!m.parentId && <SheetItem icon="🔗" label="Copy link" onClick={() => { copyLink(); closeSheet(); }} />}
                {!mine && <SheetItem icon="👁" label="Mark unread" onClick={() => { unread.mutate(); closeSheet(); }} />}
                {mine && <SheetItem icon="✏️" label="Edit message" onClick={() => { setEditing(true); closeSheet(); }} />}
                {mine && <SheetItem icon="🗑" label="Delete message" danger onClick={() => { closeSheet(); setConfirmDel(true); }} />}
                <button onClick={closeSheet} className="mt-1 w-full rounded-xl py-3 text-[15px] font-medium text-ink-soft hover:bg-paper">Cancel</button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* styled delete confirmation (replaces the browser confirm) — also portaled */}
      {confirmDel && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={() => setConfirmDel(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-serif text-lg font-semibold text-pine">Delete message?</div>
            <p className="mt-1 text-sm text-ink-soft">This can’t be undone.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-lg border border-line py-2 text-sm">Cancel</button>
              <button onClick={() => { del.mutate(); setConfirmDel(false); }} className="flex-1 rounded-lg bg-brick py-2 text-sm font-medium text-white">Delete</button>
            </div>
          </div>
        </div>,
        document.body,
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

function SheetItem({ icon, label, onClick, danger, chevron }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] hover:bg-paper ${danger ? 'text-brick' : 'text-ink'}`}>
      <span className="w-5 text-center">{icon}</span><span className="flex-1">{label}</span>{chevron && <span className="text-ink-soft">›</span>}
    </button>
  );
}
