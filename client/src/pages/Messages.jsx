import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '../api/users.api.js';
import {
  getConversations, getConversation, getMessages, postMessage,
  getThread, getMyThreads, createGroup, addMembers, openDm, markRead,
  getReminders, completeReminder, setSection,
} from '../api/messages.api.js';
import { useProfile } from '../store/ProfileContext.jsx';
import MessageComposer, { readDraft, listDrafts, clearDraft } from '../features/messages/MessageComposer.jsx';
import ChatMessage from '../features/messages/ChatMessage.jsx';
import Avatar from '../features/messages/Avatar.jsx';
import AssignPicker from '../features/events/AssignPicker.jsx';
import { groupByDept } from '../lib/orgGroups.js';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const withinGap = (a, b) => Math.abs(new Date(b) - new Date(a)) < 5 * 60e3;
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const stripFmt = (s = '') => s.replace(/[*_~`]/g, '');
// "in 20 min" / "in 2 hr" / "in 3 days" for a reminder's due time.
function dueLabel(at) {
  const ms = new Date(at) - Date.now();
  if (ms <= 0) return 'now';
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr} hr`;
  return `in ${Math.round(hr / 24)} day${Math.round(hr / 24) === 1 ? '' : 's'}`;
}

function DateDivider({ at }) {
  const d = new Date(at);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const label = d.toDateString() === today.toDateString() ? 'Today'
    : d.toDateString() === yest.toDateString() ? 'Yesterday'
    : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="my-2 flex items-center gap-3 px-4">
      <span className="h-px flex-1 bg-line" />
      <span className="rounded-full border border-line bg-white px-3 py-0.5 text-xs font-medium text-ink-soft">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export default function Messages() {
  const qc = useQueryClient();
  const { openProfile } = useProfile();
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);   // the top-level message whose thread is open
  const [modal, setModal] = useState(null);      // 'group' | 'dm' | null

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: getConversations, retry: false, refetchInterval: 5000 });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });

  // Re-render the rail when a draft is saved/cleared so the "Draft" pills update.
  const [, bumpDraft] = useState(0);
  useEffect(() => {
    const h = () => bumpDraft((n) => n + 1);
    window.addEventListener('icku-draftchange', h);
    return () => window.removeEventListener('icku-draftchange', h);
  }, []);
  const userOpts = (users.data || []).map((u) => ({ id: u.id, name: u.name, role: u.role }));

  const groups = (conversations.data || []).filter((c) => c.type === 'group');
  const dms = (conversations.data || []).filter((c) => c.type === 'dm');
  const events = (conversations.data || []).filter((c) => c.type === 'event');

  // ── Top cards (Slack-style): Catch Up · Threads · Later · Drafts ──
  const [activeCard, setActiveCard] = useState(null); // 'catchup'|'threads'|'later'|'drafts'|null
  const [pendingThread, setPendingThread] = useState(null); // deep-link into a thread from the Threads card
  const paneOpen = !!(selectedId || activeCard);
  const threadsQ = useQuery({ queryKey: ['my-threads'], queryFn: getMyThreads, retry: false, refetchInterval: 15000 });
  const remindersQ = useQuery({ queryKey: ['reminders'], queryFn: getReminders, retry: false, refetchInterval: 15000 });
  const drafts = listDrafts(); // localStorage; bumpDraft re-renders on change
  const totalUnread = (conversations.data || []).reduce((n, c) => n + (c.unread || 0), 0);

  const openConversation = (id) => { setActiveCard(null); setSelectedId(id); };
  const openThreadFrom = (convId, parent) => { setActiveCard(null); setPendingThread(parent); setSelectedId(convId); };
  const pickCard = (key) => { setSelectedId(null); setThread(null); setActiveCard((k) => (k === key ? null : key)); };

  // Mark a conversation read when it's opened (clears the unread badge). If we
  // arrived by deep-linking into a thread, open that thread too.
  useEffect(() => {
    if (!selectedId) return;
    setThread(pendingThread);
    setPendingThread(null);
    markRead(selectedId).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {});
  }, [selectedId]); // eslint-disable-line

  return (
    // On phones this is one pane at a time: the rail, or the open conversation.
    // From lg up it's the classic rail + chat + thread layout.
    <div className="flex h-[calc(100dvh-3.25rem)] gap-0 sm:h-[calc(100dvh-10rem)] sm:gap-4">
      {/* ── Left rail (Slack-style dark channel list) ── */}
      <aside className={`w-full shrink-0 flex-col overflow-hidden rounded-none bg-pine text-white sm:rounded-2xl lg:flex lg:w-64 ${paneOpen ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h1 className="font-serif text-lg font-bold text-white">Messages</h1>
        </div>
        <TopCards active={activeCard} onPick={pickCard}
          unread={totalUnread} threads={(threadsQ.data || []).length}
          reminders={(remindersQ.data || []).filter((r) => !r.doneAt).length} drafts={drafts.length} />
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <UnreadsSection
            items={(conversations.data || []).filter((c) => c.unread > 0)}
            selectedId={selectedId}
            onSelect={openConversation}
          />
          <ChannelRail
            items={groups}
            selectedId={selectedId}
            onSelect={openConversation}
            onAddChannel={() => setModal('group')}
          />
          <RailSection
            title="Direct messages"
            onAdd={() => setModal('dm')}
            items={dms}
            selectedId={selectedId}
            onSelect={openConversation}
            renderIcon={(c) => <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={20} rounded="rounded" />}
            empty="No direct messages yet"
          />
          <RailSection
            title="Project messages"
            items={events}
            selectedId={selectedId}
            onSelect={openConversation}
            renderIcon={() => <span>🗓</span>}
            empty="No project chats yet — join one from any project."
          />
        </div>
      </aside>

      {/* ── Chat pane (or an active card view) ── */}
      <section className={`relative min-w-0 flex-1 flex-col rounded-none border-0 bg-white sm:rounded-2xl sm:border sm:border-line lg:flex ${paneOpen ? 'flex' : 'hidden lg:flex'}`}>
        {activeCard ? (
          <CardView
            card={activeCard}
            conversations={conversations.data || []}
            threads={threadsQ.data || []}
            reminders={remindersQ.data || []}
            drafts={drafts}
            onBack={() => setActiveCard(null)}
            onOpenConversation={openConversation}
            onOpenThread={openThreadFrom}
            onRemindersChanged={() => qc.invalidateQueries({ queryKey: ['reminders'] })}
          />
        ) : !selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-ink-soft">
            <div className="text-4xl">💬</div>
            <p className="mt-2 text-sm">Select a conversation, or start a new one.</p>
          </div>
        ) : (
          <ChatPane
            key={selectedId}
            conversationId={selectedId}
            users={userOpts}
            onOpenThread={setThread}
            onOpenProfile={openProfile}
            onBack={() => setSelectedId(null)}
          />
        )}
      </section>

      {/* ── Thread panel ── */}
      {thread && selectedId && (
        <ThreadPanel
          conversationId={selectedId}
          parent={thread}
          users={userOpts}
          onClose={() => setThread(null)}
          onOpenProfile={openProfile}
        />
      )}

      {modal === 'group' && (
        <NewGroupModal
          onClose={() => setModal(null)}
          onCreated={(id) => { setModal(null); qc.invalidateQueries({ queryKey: ['conversations'] }); setSelectedId(id); }}
        />
      )}
      {modal === 'dm' && (
        <NewDmModal
          users={users.data || []}
          onClose={() => setModal(null)}
          onOpened={(id) => { setModal(null); qc.invalidateQueries({ queryKey: ['conversations'] }); setSelectedId(id); }}
        />
      )}
    </div>
  );
}

// ── Top cards (Catch Up · Threads · Later · Drafts), horizontal scroll ──
function TopCards({ active, onPick, unread, threads, reminders, drafts }) {
  const cards = [
    ['catchup', 'Catch Up', '🗂', unread, 'new'],
    ['threads', 'Threads', '🧵', threads, ''],
    ['later', 'Later', '🔖', reminders, ''],
    ['drafts', 'Drafts', '✏️', drafts, ''],
  ];
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none]">
      {cards.map(([key, label, icon, count, suffix]) => (
        <button key={key} onClick={() => onPick(key)}
          className={`flex min-w-[84px] shrink-0 flex-col rounded-xl border px-3 py-2 text-left transition ${active === key ? 'border-white/50 bg-white/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
          <span className="text-base leading-none">{icon}</span>
          <span className="mt-1.5 text-xs font-semibold text-white">{label}</span>
          <span className="text-[11px] text-white/60">{count > 0 ? `${count}${suffix ? ` ${suffix}` : ''}` : '—'}</span>
        </button>
      ))}
    </div>
  );
}

// Shell for a card's list view in the chat pane (header + scroll body).
function PaneShell({ title, subtitle, onBack, children }) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button onClick={onBack} className="-ml-1 shrink-0 rounded-lg p-1 text-ink-soft hover:bg-paper lg:hidden" aria-label="Back">←</button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-lg font-semibold text-pine">{title}</div>
          {subtitle && <div className="truncate text-xs text-ink-soft">{subtitle}</div>}
        </div>
        <button onClick={onBack} className="hidden shrink-0 rounded-lg p-1 text-ink-soft hover:bg-paper lg:block" aria-label="Close">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{children}</div>
    </>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-ink-soft">
      <div className="text-3xl">{icon}</div><p className="mt-2 text-sm">{text}</p>
    </div>
  );
}

function ConvBadge({ c }) {
  if (c.type === 'dm') return <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={32} />;
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pine-tint text-sm text-pine">{c.type === 'event' ? '🗓' : '#'}</span>;
}

function CardView({ card, conversations, threads, reminders, drafts, onBack, onOpenConversation, onOpenThread, onRemindersChanged }) {
  if (card === 'catchup') return <CatchUpView conversations={conversations} onBack={onBack} onOpen={onOpenConversation} />;
  if (card === 'threads') return <ThreadsView threads={threads} onBack={onBack} onOpenThread={onOpenThread} />;
  if (card === 'later') return <LaterView reminders={reminders} onBack={onBack} onOpen={onOpenConversation} onChanged={onRemindersChanged} />;
  if (card === 'drafts') return <DraftsView drafts={drafts} conversations={conversations} onBack={onBack} onOpen={onOpenConversation} />;
  return null;
}

function CatchUpView({ conversations, onBack, onOpen }) {
  const unread = conversations.filter((c) => c.unread > 0)
    .sort((a, b) => new Date(b.lastMessage?.at || 0) - new Date(a.lastMessage?.at || 0));
  return (
    <PaneShell title="Catch Up" subtitle={unread.length ? `${unread.length} conversation${unread.length === 1 ? '' : 's'} with unread` : ''} onBack={onBack}>
      {unread.length === 0 ? <Empty icon="🎉" text="You're all caught up." /> : unread.map((c) => (
        <button key={c.id} onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-paper">
          <ConvBadge c={c} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">{c.type === 'group' ? '# ' : c.type === 'event' ? '🗓 ' : ''}{c.name}</div>
            {c.lastMessage && <div className="truncate text-xs text-ink-soft">{c.lastMessage.author}: {stripFmt(c.lastMessage.body) || '📎 attachment'}</div>}
          </div>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sage px-1.5 text-[11px] font-bold text-white">{c.unread > 99 ? '99+' : c.unread}</span>
        </button>
      ))}
    </PaneShell>
  );
}

function ThreadsView({ threads, onBack, onOpenThread }) {
  return (
    <PaneShell title="Threads" subtitle={threads.length ? `${threads.length} thread${threads.length === 1 ? '' : 's'} you're in` : ''} onBack={onBack}>
      {threads.length === 0 ? <Empty icon="🧵" text="No threads yet." /> : threads.map((t) => (
        <button key={t.id} onClick={() => onOpenThread(t.conversationId, t)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-paper">
          <Avatar id={t.authorId} name={t.author} photoUrl={t.authorPhoto} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-steel">{t.conversationType === 'group' ? '#' : t.conversationType === 'event' ? '🗓' : ''} {t.conversationName}</div>
            <div className="truncate text-sm text-ink"><span className="font-semibold">{t.author}: </span>{stripFmt(t.body) || '(no text)'}</div>
            <div className="text-[11px] text-ink-soft">💬 {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}{t.lastReplyAt ? ` · last ${timeOf(t.lastReplyAt)}` : ''}</div>
          </div>
        </button>
      ))}
    </PaneShell>
  );
}

function LaterView({ reminders, onBack, onOpen, onChanged }) {
  const done = useMutation({ mutationFn: completeReminder, onSuccess: onChanged });
  const active = reminders.filter((r) => !r.doneAt).sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
  return (
    <PaneShell title="Later" subtitle={active.length ? `${active.length} saved` : ''} onBack={onBack}>
      {active.length === 0 ? <Empty icon="🔖" text="Nothing saved for later." /> : active.map((r) => (
        <div key={r.id} className="group flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-paper">
          <button onClick={() => done.mutate(r.id)} title="Mark done" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-transparent hover:border-sage hover:text-sage">✓</button>
          <button onClick={() => r.conversationId && onOpen(r.conversationId)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm text-ink">{stripFmt(r.text) || 'Saved message'}</div>
            <div className={`text-[11px] ${r.due ? 'font-semibold text-brick' : 'text-ink-soft'}`}>{r.due ? '⏰ Due now' : `Due ${dueLabel(r.remindAt)}`}</div>
          </button>
        </div>
      ))}
    </PaneShell>
  );
}

function DraftsView({ drafts, conversations, onBack, onOpen }) {
  const [, bump] = useState(0);
  const nameOf = (id) => { const c = conversations.find((x) => x.id === id); return c ? `${c.type === 'group' ? '# ' : c.type === 'event' ? '🗓 ' : ''}${c.name}` : 'Conversation'; };
  return (
    <PaneShell title="Drafts" subtitle={drafts.length ? `${drafts.length} unsent` : ''} onBack={onBack}>
      {drafts.length === 0 ? <Empty icon="✏️" text="No drafts." /> : drafts.map((d) => (
        <div key={d.conversationId} className="group flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-paper">
          <button onClick={() => onOpen(d.conversationId)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-ink">{nameOf(d.conversationId)}</div>
            <div className="truncate text-xs text-ink-soft">{stripFmt(d.text)}</div>
          </button>
          <button onClick={() => { clearDraft(d.conversationId); bump((n) => n + 1); }} title="Discard draft" className="shrink-0 text-[11px] text-ink-soft opacity-0 hover:text-brick group-hover:opacity-100">discard</button>
        </div>
      ))}
    </PaneShell>
  );
}

// Slack-style "Unreads" group pinned above the channel list: every conversation
// with unread messages, whatever its type, so you can clear them top-down.
function UnreadsSection({ items, selectedId, onSelect }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="px-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-white/45">Unreads</div>
      <div className="mt-1 space-y-0.5">
        {items.map((c) => (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${selectedId === c.id ? 'bg-white/20' : 'hover:bg-white/10'}`}>
            {c.type === 'dm'
              ? <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={20} rounded="rounded" />
              : <span className="w-5 shrink-0 text-center text-white/50">{c.type === 'event' ? '🗓' : '#'}</span>}
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">{c.name}</span>
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sage px-1 text-[10px] font-bold text-white">{c.unread > 99 ? '99+' : c.unread}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RailSection({ title, onAdd, items, selectedId, onSelect, renderIcon, empty }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-white/45">{title}</span>
        {onAdd && <button onClick={onAdd} title={`New ${title}`} className="text-white/55 hover:text-white">＋</button>}
      </div>
      <div className="mt-1 space-y-0.5">
        {items.length === 0 && <p className="px-2 py-1 text-xs text-white/40">{empty}</p>}
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
              selectedId === c.id ? 'bg-white/20' : 'hover:bg-white/10'
            }`}
          >
            {renderIcon(c)}
            <span className={`min-w-0 flex-1 truncate text-[15px] ${c.unread > 0 ? 'font-bold text-white' : selectedId === c.id ? 'font-semibold text-white' : 'font-medium text-white/70'}`}>{c.name}</span>
            {selectedId !== c.id && readDraft(c.id) && (
              <span className="rounded bg-white/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-white/70">draft</span>
            )}
            {c.unread > 0 && (
              <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${selectedId === c.id ? 'bg-white/30 text-white' : 'bg-sage text-white'}`}>
                {c.unread > 99 ? '99+' : c.unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Channels rail with personal grouping: ungrouped channels first, then each
// named section. Every channel has a "⋯" to move it between sections.
function ChannelRail({ items, selectedId, onSelect, onAddChannel }) {
  const qc = useQueryClient();
  const move = useMutation({ mutationFn: ({ id, section }) => setSection(id, section), onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }) });
  const sections = [...new Set(items.map((c) => c.section).filter(Boolean))].sort();
  const ungrouped = items.filter((c) => !c.section);
  const rows = (list) => list.map((c) => (
    <ChannelRow key={c.id} c={c} selected={selectedId === c.id} onSelect={onSelect} sections={sections} onMove={(section) => move.mutate({ id: c.id, section })} />
  ));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-white/45">Channels</span>
        <button onClick={onAddChannel} title="New channel" className="text-white/55 hover:text-white">＋</button>
      </div>
      <div className="mt-1 space-y-0.5">
        {items.length === 0 && <p className="px-2 py-1 text-xs text-white/40">No channels yet</p>}
        {rows(ungrouped)}
      </div>
      {sections.map((sec) => (
        <div key={sec} className="mt-2">
          <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">{sec}</div>
          <div className="mt-1 space-y-0.5">{rows(items.filter((c) => c.section === sec))}</div>
        </div>
      ))}
    </div>
  );
}

function ChannelRow({ c, selected, onSelect, sections, onMove }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className={`group/row relative flex items-center rounded-lg pr-1 ${selected ? 'bg-white/20' : 'hover:bg-white/10'}`}>
      <button onClick={() => onSelect(c.id)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
        <span className="text-white/50">#</span>
        <span className={`min-w-0 flex-1 truncate text-[15px] ${c.unread > 0 ? 'font-bold text-white' : selected ? 'font-semibold text-white' : 'font-medium text-white/70'}`}>{c.name}</span>
        {!selected && readDraft(c.id) && <span className="rounded bg-white/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-white/70">draft</span>}
        {c.unread > 0 && (
          <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${selected ? 'bg-white/30 text-white' : 'bg-sage text-white'}`}>{c.unread > 99 ? '99+' : c.unread}</span>
        )}
      </button>
      <button onClick={() => setMenu((v) => !v)} title="Move to section"
        className="shrink-0 px-1 text-white/40 opacity-0 hover:text-white group-hover/row:opacity-100">⋯</button>
      {menu && (
        <div className="absolute right-1 top-9 z-30 w-48 rounded-lg border border-line bg-white py-1 text-sm text-ink shadow-lg">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Move to section</div>
          {sections.filter((s) => s !== c.section).map((s) => (
            <button key={s} onClick={() => { onMove(s); setMenu(false); }} className="block w-full px-3 py-1 text-left hover:bg-paper">{s}</button>
          ))}
          <button onClick={() => { const n = prompt('New section name'); if (n && n.trim()) onMove(n.trim()); setMenu(false); }} className="block w-full px-3 py-1 text-left font-medium text-pine hover:bg-paper">+ New section…</button>
          {c.section && <button onClick={() => { onMove(''); setMenu(false); }} className="block w-full border-t border-line px-3 py-1 text-left text-ink-soft hover:bg-paper">Remove from “{c.section}”</button>}
        </div>
      )}
    </div>
  );
}

function ChatPane({ conversationId, users, onOpenThread, onOpenProfile, onBack }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState('');
  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => getConversation(conversationId), retry: false });
  const messages = useQuery({ queryKey: ['messages', conversationId], queryFn: () => getMessages(conversationId), retry: false, refetchInterval: 3000 });
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: getReminders, retry: false });
  const remindByMsg = new Map((reminders.data || []).filter((r) => r.messageId).map((r) => [r.messageId, r.remindAt]));
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.data?.length]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); }, [toast]);

  const send = useMutation({
    mutationFn: (payload) => postMessage(conversationId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const c = conv.data;
  return (
    <>
      {/* header */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {onBack && (
          <button onClick={onBack} className="-ml-1 shrink-0 rounded-lg p-1 text-ink-soft hover:bg-paper lg:hidden" aria-label="Back to conversations">←</button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-lg font-semibold text-pine">
            {c?.type === 'group' ? '# ' : c?.type === 'event' ? '🗓 ' : ''}{c?.name || '…'}
          </div>
          {c && (
            <div className="truncate text-xs text-ink-soft">
              {c.type === 'dm' ? 'Direct message' : c.type === 'event' ? `Project chat · ${c.members.length} people` : `${c.members.length} members`}
            </div>
          )}
        </div>
        {c?.type === 'group' && (
          <button onClick={() => setAddOpen(true)} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-pine hover:text-pine">
            + Add people
          </button>
        )}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {messages.isLoading && <p className="px-4 py-6 text-sm text-ink-soft">Loading…</p>}
        {messages.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-soft">No messages yet. Say hello! 👋</p>}
        {messages.data?.map((m, i) => {
          const prev = messages.data[i - 1];
          const newDay = !prev || !sameDay(prev.at, m.at);
          const compact = !newDay && prev && prev.authorId === m.authorId && withinGap(prev.at, m.at) && !prev.deleted;
          return (
            <div key={m.id}>
              {newDay && <DateDivider at={m.at} />}
              <ChatMessage
                m={m} compact={compact} conversationId={conversationId} reminderAt={remindByMsg.get(m.id)}
                onOpenThread={onOpenThread} onOpenProfile={onOpenProfile}
                onChanged={() => qc.invalidateQueries({ queryKey: ['messages', conversationId] })}
                onRemind={() => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['reminders'] }); setToast('🔖 Saved for later'); }}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {toast && <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-pine px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}

      {/* composer */}
      <div className="border-t border-line p-3">
        <MessageComposer onSend={(p) => send.mutateAsync(p)} users={users} placeholder={`Message ${c?.name || ''}`} draftKey={conversationId} />
      </div>

      {addOpen && c && (
        <AddPeopleModal
          conversationId={conversationId}
          existing={c.members.map((m) => m.id)}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ['conversation', conversationId] }); qc.invalidateQueries({ queryKey: ['conversations'] }); }}
        />
      )}
    </>
  );
}

function ThreadPanel({ conversationId, parent, users, onClose, onOpenProfile }) {
  const qc = useQueryClient();
  const thread = useQuery({ queryKey: ['thread', parent.id], queryFn: () => getThread(parent.id), retry: false, refetchInterval: 3000 });
  const reply = useMutation({
    mutationFn: (payload) => postMessage(conversationId, { ...payload, parentId: parent.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', parent.id] });
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  return (
    // Full-screen over the chat on phones; a side panel from lg up.
    <aside className="fixed inset-0 z-40 flex flex-col bg-white lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:rounded-2xl lg:border lg:border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-serif text-sm font-bold text-pine">Thread</span>
        <button onClick={onClose} className="text-ink-soft hover:text-brick" aria-label="Close">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {thread.data && (
          <>
            <ChatMessage m={thread.data.parent} conversationId={conversationId} onOpenProfile={onOpenProfile}
              onChanged={() => { qc.invalidateQueries({ queryKey: ['thread', parent.id] }); qc.invalidateQueries({ queryKey: ['messages', conversationId] }); }} />
            <div className="my-1 flex items-center gap-2 px-4 text-[11px] text-ink-soft">
              <span>{thread.data.replies.length} {thread.data.replies.length === 1 ? 'reply' : 'replies'}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            {thread.data.replies.map((r) => (
              <ChatMessage key={r.id} m={r} conversationId={conversationId} onOpenProfile={onOpenProfile}
                onChanged={() => qc.invalidateQueries({ queryKey: ['thread', parent.id] })} />
            ))}
          </>
        )}
      </div>
      <div className="border-t border-line p-3">
        <MessageComposer onSend={(p) => reply.mutateAsync(p)} users={users} placeholder="Reply…" autoFocus />
      </div>
    </aside>
  );
}

// ── Modals ──────────────────────────────────────────────────────────
function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      {/* max-h + scroll: with the people picker open this can get tall, and the
          action buttons must stay reachable rather than run off the viewport. */}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold text-pine">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function NewGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const mut = useMutation({ mutationFn: () => createGroup(name.trim(), memberIds), onSuccess: (g) => onCreated(g.id) });
  return (
    <ModalShell title="New group" onClose={onClose}>
      <label className="mt-4 block text-sm"><span className="text-ink-soft">Group name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Class 7-8 Team"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
      </label>
      <div className="mt-3 text-sm"><span className="text-ink-soft">Add people</span>
        <div className="mt-1"><AssignPicker value={memberIds} onChange={setMemberIds} /></div>
      </div>
      {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create group</button>
      </div>
    </ModalShell>
  );
}

function NewDmModal({ users, onClose, onOpened }) {
  const [q, setQ] = useState('');
  const mut = useMutation({ mutationFn: (userId) => openDm(userId), onSuccess: (c) => onOpened(c.id) });
  const groups = groupByDept(users, q);
  return (
    <ModalShell title="New direct message" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search name, role or department…"
        className="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
      <div className="mt-2 max-h-72 overflow-y-auto">
        {groups.length === 0 && <p className="px-2 py-2 text-xs text-ink-soft">No matches.</p>}
        {groups.map(([dept, members]) => (
          <div key={dept} className="mb-1">
            <div className="rounded bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{dept} · {members.length}</div>
            {members.map((u) => (
              <button key={u.id} onClick={() => mut.mutate(u.id)} disabled={mut.isPending}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-pine-tint">
                <Avatar id={u.id} name={u.name} photoUrl={u.photoUrl} size={28} />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="truncate text-xs text-ink-soft">{u.role}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function AddPeopleModal({ conversationId, existing, onClose, onDone }) {
  const [memberIds, setMemberIds] = useState([]);
  const mut = useMutation({ mutationFn: () => addMembers(conversationId, memberIds), onSuccess: onDone });
  return (
    <ModalShell title="Add people" onClose={onClose}>
      <div className="mt-4 text-sm"><span className="text-ink-soft">Choose colleagues to add</span>
        <div className="mt-1"><AssignPicker value={memberIds} onChange={setMemberIds} /></div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Already in this group: {existing.length} {existing.length === 1 ? 'person' : 'people'}.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
        <button onClick={() => mut.mutate()} disabled={!memberIds.length || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add</button>
      </div>
    </ModalShell>
  );
}
