import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '../api/users.api.js';
import {
  getConversations, getConversation, getMessages, postMessage,
  getThread, getMyThreads, createGroup, addMembers, openDm, markRead,
  getReminders, completeReminder, setSection, getFiles, searchMessages,
} from '../api/messages.api.js';
import { useProfile } from '../store/ProfileContext.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import MessageComposer, { readDraft, listDrafts, clearDraft } from '../features/messages/MessageComposer.jsx';
import ChatMessage from '../features/messages/ChatMessage.jsx';
import Avatar from '../features/messages/Avatar.jsx';
import AssignPicker from '../features/events/AssignPicker.jsx';
import { groupByDept } from '../lib/orgGroups.js';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const withinGap = (a, b) => Math.abs(new Date(b) - new Date(a)) < 5 * 60e3;
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const stripFmt = (s = '') => s.replace(/[*_~`]/g, '');
// Short timestamp for search hits: time if today, else a short date.
const shortWhen = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
// Highlight the matched term inside a (server-windowed) snippet.
function highlightMatch(text = '', q = '') {
  const clean = stripFmt(text);
  const term = q.trim();
  const idx = term ? clean.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (idx < 0) return clean;
  return (
    <>
      {clean.slice(0, idx)}
      <mark className="rounded bg-ochre/30 px-0.5 text-ink">{clean.slice(idx, idx + term.length)}</mark>
      {clean.slice(idx + term.length)}
    </>
  );
}

// Debounce a value so fast typing doesn't fire a request per keystroke.
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
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

// ── Minimal line icons (Slack-style); stroke follows the current text colour ──
const Ic = (p) => <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p} />;
const CatchUpIcon = () => <Ic><path d="M3 12l2.2-7h9.6L17 12M3 12v4h14v-4M3 12h4l1 1.8h4l1-1.8h4" /></Ic>;
const ThreadIcon = () => <Ic><path d="M4 4.5h12v8H8.5L5.5 15.5v-3H4z" /></Ic>;
const LaterIcon = () => <Ic><path d="M6 3.5h8v13l-4-3-4 3z" /></Ic>;
const DraftIcon = () => <Ic><path d="M12.5 3.5l4 4M4 16l.9-3.6 8-8L16.5 8l-8 8L4 16z" /></Ic>;
const HomeIcon = () => <Ic><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8.6V16h9V8.6" /></Ic>;
const DmIcon = () => <Ic><path d="M4 5h12v7H8l-3 2.6V12H4z" /></Ic>;
const FileIcon = () => <Ic><path d="M6 3.5h5l3.5 3.5V16.5H6zM11 3.5V7h3.5" /></Ic>;
const SearchIcon = () => <Ic><circle cx="9" cy="9" r="5" /><path d="M12.8 12.8L16.5 16.5" /></Ic>;
const PlusIcon = () => <Ic strokeWidth="2"><path d="M10 4v12M4 10h12" /></Ic>;
// Collapse chevron shown on the RIGHT of each section header (Slack-style):
// points up when the section is open, down when collapsed.
const CollapseChevron = ({ open }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={open ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} /></svg>
);

// Slack-style section header: a bold label on the left; the "+" (optional) and
// the collapse chevron sit together on the right.
function SectionHeader({ title, open, onToggle, onAdd }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <button onClick={onToggle} className="flex items-center gap-1 text-[15px] font-bold text-ink hover:text-pine">
        {title}<span className="text-ink-soft">›</span>
      </button>
      <div className="flex items-center gap-0.5 text-ink-soft">
        {onAdd && <button onClick={onAdd} title={`New ${title}`} className="rounded p-1 hover:bg-paper hover:text-pine"><PlusIcon /></button>}
        <button onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'} className="rounded p-1 hover:bg-paper hover:text-pine"><CollapseChevron open={open} /></button>
      </div>
    </div>
  );
}

// Slack-style "New messages" line, marking where you last left off.
function UnreadDivider() {
  return (
    <div className="my-1.5 flex items-center gap-2 px-4">
      <span className="h-px flex-1 bg-brick/40" />
      <span className="shrink-0 rounded-full bg-brick/10 px-2 py-0.5 text-[11px] font-semibold text-brick">New messages</span>
      <span className="h-px flex-1 bg-brick/40" />
    </div>
  );
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
  const [modal, setModal] = useState(null);      // 'group' | 'compose' | null
  const [mobileTab, setMobileTab] = useState('home'); // phone footer: 'home' | 'dms' | 'files'
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [focusMsg, setFocusMsg] = useState(null); // a search hit to scroll to when its conversation opens

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

  const q = search.trim().toLowerCase();
  const match = (c) => !q || (c.name || '').toLowerCase().includes(q);
  const groups = (conversations.data || []).filter((c) => c.type === 'group' && match(c));
  const dms = (conversations.data || []).filter((c) => c.type === 'dm' && match(c));
  const events = (conversations.data || []).filter((c) => c.type === 'event' && match(c));

  // ── Top cards (Slack-style): Catch Up · Threads · Later · Drafts ──
  const [activeCard, setActiveCard] = useState(null); // 'catchup'|'threads'|'later'|'drafts'|null
  const [pendingThread, setPendingThread] = useState(null); // deep-link into a thread from the Threads card
  const paneOpen = !!(selectedId || activeCard);
  const threadsQ = useQuery({ queryKey: ['my-threads'], queryFn: getMyThreads, retry: false, refetchInterval: 15000 });
  const remindersQ = useQuery({ queryKey: ['reminders'], queryFn: getReminders, retry: false, refetchInterval: 15000 });
  const drafts = listDrafts(); // localStorage; bumpDraft re-renders on change
  const totalUnread = (conversations.data || []).reduce((n, c) => n + (c.unread || 0), 0);

  const openConversation = (id, msgId = null) => { setActiveCard(null); setFocusMsg(msgId); setSelectedId(id); };
  const openThreadFrom = (convId, parent) => { setActiveCard(null); setPendingThread(parent); setSelectedId(convId); };
  const pickCard = (key) => { setSelectedId(null); setThread(null); setActiveCard((k) => (k === key ? null : key)); };

  // If we arrived by deep-linking into a thread, open that thread too.
  // (Marking read is done inside ChatPane, AFTER it captures the last-read marker
  // for the "New messages" divider — doing it here would race that capture.)
  useEffect(() => {
    if (!selectedId) return;
    setThread(pendingThread);
    setPendingThread(null);
  }, [selectedId]); // eslint-disable-line

  // Deep link from "Copy link": /messages?c=<conv>&m=<msg> opens that conversation
  // and scrolls to the message, then strips the params so a refresh doesn't repeat.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('c');
    if (c) {
      openConversation(c, p.get('m'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line

  return (
    // On phones this is one pane at a time: the rail, or the open conversation.
    // From lg up it's the classic rail + chat + thread layout.
    <div className="flex h-[calc(100dvh-3.25rem)] gap-0 sm:h-[calc(100dvh-10rem)] sm:gap-4">
      {/* ── Left rail (Slack-style, light; ICKU green accent) ── */}
      <aside className={`relative w-full shrink-0 flex-col overflow-hidden rounded-none bg-white text-ink sm:rounded-2xl sm:border sm:border-line lg:flex lg:w-64 ${paneOpen ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h1 className="font-serif text-lg font-bold text-pine">Messages</h1>
          {/* Desktop search toggle (phones use the footer search button). */}
          <button onClick={() => setSearchOpen((o) => !o)} aria-label="Search messages"
            className={`hidden rounded-lg p-1.5 lg:inline-flex ${searchOpen ? 'bg-pine-tint text-pine' : 'text-ink-soft hover:bg-paper hover:text-pine'}`}><SearchIcon /></button>
        </div>

        {searchOpen && (
          <div className="border-b border-line px-3 py-2">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…"
              className="w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder-ink-soft outline-none focus:border-pine" />
          </div>
        )}

        {mobileTab === 'home' && (
          <TopCards active={activeCard} onPick={pickCard}
            unread={totalUnread} threads={(threadsQ.data || []).length}
            reminders={(remindersQ.data || []).filter((r) => !r.doneAt).length} drafts={drafts.length} />
        )}

        {/* Full-width dividers between sections, Slack-style */}
        <div className="flex-1 divide-y divide-line overflow-y-auto pb-28 lg:pb-3">
          {search.trim().length >= 2 && <MessageSearchResults q={search} onOpen={openConversation} />}
          {mobileTab === 'files' ? (
            <FilesView onOpen={openConversation} />
          ) : mobileTab === 'dms' ? (
            <RailSection
              title="Direct messages" onAdd={() => setModal('compose')} items={dms}
              selectedId={selectedId} onSelect={openConversation}
              renderIcon={(c) => <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={20} rounded="rounded" />}
              empty={q ? 'No matches' : 'No direct messages yet'}
            />
          ) : (
            <>
              <UnreadsSection
                items={(conversations.data || []).filter((c) => c.unread > 0 && match(c))}
                selectedId={selectedId}
                onSelect={openConversation}
              />
              <GroupRail
                items={groups}
                selectedId={selectedId}
                onSelect={openConversation}
                onAddGroup={() => setModal('group')}
              />
              <RailSection
                title="Direct messages"
                onAdd={() => setModal('compose')}
                items={dms}
                selectedId={selectedId}
                onSelect={openConversation}
                renderIcon={(c) => <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={20} rounded="rounded" />}
                empty={q ? 'No matches' : 'No direct messages yet'}
              />
              <RailSection
                title="Project messages"
                items={events}
                selectedId={selectedId}
                onSelect={openConversation}
                renderIcon={() => <span className="w-5 shrink-0 text-center text-ink-soft">🗓</span>}
                empty={q ? 'No matches' : 'No project chats yet — join one from any project.'}
              />
            </>
          )}
        </div>

        {/* Bottom: floating pill nav + FAB + search (phones only) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 lg:hidden">
          <div className="flex justify-end px-4">
            <button onClick={() => setFabOpen(true)} aria-label="New conversation"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-pine text-white shadow-lg active:scale-95"><PlusIcon /></button>
          </div>
          <div className="flex items-center gap-2 p-3">
            <div className="pointer-events-auto flex flex-1 items-center rounded-full border border-line bg-white p-1 shadow-lg">
              {[['home', 'Home', HomeIcon], ['dms', 'DMs', DmIcon], ['files', 'Files', FileIcon]].map(([key, label, Icon]) => (
                <button key={key} onClick={() => setMobileTab(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold ${mobileTab === key ? 'bg-pine-tint text-pine' : 'text-ink-soft'}`}>
                  <Icon /><span>{label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSearchOpen((o) => !o)} aria-label="Search"
              className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-lg ${searchOpen ? 'border-pine bg-pine-tint text-pine' : 'border-line bg-white text-ink-soft'}`}><SearchIcon /></button>
          </div>
        </div>

        {fabOpen && (
          <NewSheet
            onClose={() => setFabOpen(false)}
            onGroup={() => { setFabOpen(false); setModal('group'); }}
            onCompose={() => { setFabOpen(false); setModal('compose'); }}
          />
        )}
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
            focusMessageId={focusMsg}
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
      {modal === 'compose' && (
        <NewMessageModal
          users={users.data || []}
          groups={(conversations.data || []).filter((c) => c.type === 'group')}
          onClose={() => setModal(null)}
          onSent={(id) => { setModal(null); qc.invalidateQueries({ queryKey: ['conversations'] }); setSelectedId(id); }}
        />
      )}
    </div>
  );
}

// ── Top cards (Catch Up · Threads · Later · Drafts), horizontal scroll ──
function TopCards({ active, onPick, unread, threads, reminders, drafts }) {
  const cards = [
    ['catchup', 'Catch Up', CatchUpIcon, unread, 'new'],
    ['threads', 'Threads', ThreadIcon, threads, ''],
    ['later', 'Later', LaterIcon, reminders, ''],
    ['drafts', 'Drafts', DraftIcon, drafts, ''],
  ];
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none]">
      {cards.map(([key, label, Icon, count, suffix]) => (
        <button key={key} onClick={() => onPick(key)}
          className={`flex min-w-[84px] shrink-0 flex-col rounded-xl border px-3 py-2 text-left transition ${active === key ? 'border-pine bg-pine-tint' : 'border-line bg-white hover:bg-paper'}`}>
          <span className="text-ink-soft"><Icon /></span>
          <span className="mt-1.5 text-xs font-semibold text-ink">{label}</span>
          <span className="text-[11px] text-ink-soft">{count > 0 ? `${count}${suffix ? ` ${suffix}` : ''}` : '—'}</span>
        </button>
      ))}
    </div>
  );
}

// The FAB "+" action sheet — new group or new direct message.
function NewSheet({ onClose, onGroup, onCompose }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-ink/30 lg:hidden" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-2 text-ink" onClick={(e) => e.stopPropagation()}>
        <button onClick={onCompose} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-paper">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine-tint text-pine"><DmIcon /></span>
          <span><span className="block font-semibold">New message</span><span className="block text-xs text-ink-soft">Message a person or group</span></span>
        </button>
        <button onClick={onGroup} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-paper">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine-tint text-pine">#</span>
          <span><span className="block font-semibold">New group</span><span className="block text-xs text-ink-soft">Start a named group channel</span></span>
        </button>
        <button onClick={onClose} className="mt-1 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-paper">Cancel</button>
      </div>
    </div>
  );
}

// Files tab — every image/file shared in my conversations, newest first.
function FilesView({ onOpen }) {
  const filesQ = useQuery({ queryKey: ['msg-files'], queryFn: getFiles, retry: false });
  const files = filesQ.data || [];
  return (
    <div className="py-1.5">
      <div className="px-3 pb-1 pt-1 text-[15px] font-bold text-ink">Files</div>
      {filesQ.isLoading && <p className="px-3 py-2 text-xs text-ink-soft">Loading…</p>}
      {!filesQ.isLoading && files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-ink-soft">
          <span className="opacity-70"><FileIcon /></span>
          <p className="mt-2 text-sm">No files shared yet.</p>
        </div>
      )}
      <div className="space-y-0.5 px-2">
        {files.map((f) => (
          <button key={f.id} onClick={() => onOpen(f.conversationId)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-paper">
            {f.kind === 'image'
              ? <img src={f.url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-paper text-ink-soft"><FileIcon /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{f.name}</span>
              <span className="block truncate text-[11px] text-ink-soft">{f.author} · {f.conversationName || 'Direct message'}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Message-content search results (shown in the rail while searching).
function MessageSearchResults({ q, onOpen }) {
  const term = useDebounced(q.trim(), 300);
  const res = useQuery({ queryKey: ['msg-search', term], queryFn: () => searchMessages(term), enabled: term.length >= 2, retry: false });
  const hits = res.data || [];
  const ready = term.length >= 2;
  return (
    <div className="py-1.5">
      <div className="px-3 pb-1 pt-1 text-[15px] font-bold text-ink">Messages</div>
      {ready && res.isLoading && <p className="px-3 py-1 text-xs text-ink-soft">Searching…</p>}
      {res.isError && <p className="px-3 py-1 text-xs text-brick">Search failed — try again.</p>}
      {ready && !res.isLoading && !res.isError && hits.length === 0 && <p className="px-3 py-1 text-xs text-ink-soft">No message matches.</p>}
      <div className="space-y-0.5 px-2">
        {hits.map((h) => (
          <button key={h.id} onClick={() => onOpen(h.conversationId, h.id)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-paper">
            <span className="flex items-center gap-1 truncate text-[11px] text-ink-soft">
              <span className="text-ink-soft">{h.conversationType === 'group' ? '#' : h.conversationType === 'event' ? '🗓' : ''}</span>
              <span className="font-semibold text-ink">{h.author}</span>
              <span className="truncate">· {h.conversationName} · {shortWhen(h.at)}</span>
            </span>
            <span className="mt-0.5 block break-words text-[13px] leading-snug text-ink">{highlightMatch(h.snippet, term)}</span>
          </button>
        ))}
      </div>
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
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  return (
    <div className="py-1.5">
      <SectionHeader title="Unreads" open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="space-y-0.5 px-2">
          {items.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${selectedId === c.id ? 'bg-pine-tint' : 'hover:bg-paper'}`}>
              {c.type === 'dm'
                ? <Avatar id={c.id} name={c.name} photoUrl={c.photoUrl} size={20} rounded="rounded" />
                : <span className="w-5 shrink-0 text-center text-ink-soft">{c.type === 'event' ? '🗓' : '#'}</span>}
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{c.name}</span>
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sage px-1 text-[10px] font-bold text-white">{c.unread > 99 ? '99+' : c.unread}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RailSection({ title, onAdd, items, selectedId, onSelect, renderIcon, empty }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-1.5">
      <SectionHeader title={title} open={open} onToggle={() => setOpen((o) => !o)} onAdd={onAdd} />
      {open && (
        <div className="space-y-0.5 px-2">
          {items.length === 0 && <p className="px-2 py-1 text-xs text-ink-soft">{empty}</p>}
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                selectedId === c.id ? 'bg-pine-tint' : 'hover:bg-paper'
              }`}
            >
              {renderIcon(c)}
              <span className={`min-w-0 flex-1 truncate text-[15px] ${c.unread > 0 ? 'font-bold text-ink' : selectedId === c.id ? 'font-semibold text-pine' : 'font-medium text-ink'}`}>{c.name}</span>
              {selectedId !== c.id && readDraft(c.id) && (
                <span className="rounded bg-line/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">draft</span>
              )}
              {c.unread > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sage px-1 text-[10px] font-bold text-white">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Groups rail with personal grouping: ungrouped groups first, then each named
// section. Every group has a "⋯" to move it between sections. Collapsible.
function GroupRail({ items, selectedId, onSelect, onAddGroup }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const move = useMutation({ mutationFn: ({ id, section }) => setSection(id, section), onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }) });
  const sections = [...new Set(items.map((c) => c.section).filter(Boolean))].sort();
  const ungrouped = items.filter((c) => !c.section);
  const rows = (list) => list.map((c) => (
    <ChannelRow key={c.id} c={c} selected={selectedId === c.id} onSelect={onSelect} sections={sections} onMove={(section) => move.mutate({ id: c.id, section })} />
  ));
  return (
    <div className="py-1.5">
      <SectionHeader title="Groups" open={open} onToggle={() => setOpen((o) => !o)} onAdd={onAddGroup} />
      {open && (
        <div className="px-2">
          <div className="space-y-0.5">
            {items.length === 0 && <p className="px-2 py-1 text-xs text-ink-soft">No groups yet</p>}
            {rows(ungrouped)}
          </div>
          {sections.map((sec) => (
            <div key={sec} className="mt-2">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{sec}</div>
              <div className="mt-1 space-y-0.5">{rows(items.filter((c) => c.section === sec))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelRow({ c, selected, onSelect, sections, onMove }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className={`group/row relative flex items-center rounded-lg pr-1 ${selected ? 'bg-pine-tint' : 'hover:bg-paper'}`}>
      <button onClick={() => onSelect(c.id)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left">
        <span className="text-ink-soft">#</span>
        <span className={`min-w-0 flex-1 truncate text-[15px] ${c.unread > 0 ? 'font-bold text-ink' : selected ? 'font-semibold text-pine' : 'font-medium text-ink'}`}>{c.name}</span>
        {!selected && readDraft(c.id) && <span className="rounded bg-line/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">draft</span>}
        {c.unread > 0 && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sage px-1 text-[10px] font-bold text-white">{c.unread > 99 ? '99+' : c.unread}</span>
        )}
      </button>
      <button onClick={() => setMenu((v) => !v)} title="Move to section"
        className="shrink-0 px-1 text-ink-soft opacity-0 hover:text-pine group-hover/row:opacity-100">⋯</button>
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

function ChatPane({ conversationId, users, focusMessageId, onOpenThread, onOpenProfile, onBack }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const me = user?.id;
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState('');
  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => getConversation(conversationId), retry: 1 });
  const messages = useQuery({ queryKey: ['messages', conversationId], queryFn: () => getMessages(conversationId), retry: false, refetchInterval: 3000 });
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: getReminders, retry: false });
  const remindByMsg = new Map((reminders.data || []).filter((r) => r.messageId).map((r) => [r.messageId, r.remindAt]));
  const bottomRef = useRef(null);
  const dividerRef = useRef(null);

  // Freeze the last-read marker at open time (before we mark read) so the
  // "New messages" divider stays put for the whole visit.
  const markerRef = useRef(undefined);
  if (markerRef.current === undefined && conv.data) markerRef.current = conv.data.lastReadAt ?? null;
  const marker = markerRef.current;
  const msgs = messages.data || [];
  // A null marker means never-opened — the sidebar counts all of it unread, so
  // put the divider before the first message from someone else (matches the badge).
  const firstUnreadId = msgs.find((m) => m.authorId !== me && (!marker || new Date(m.at) > new Date(marker)))?.id;

  // Initial landing (runs once, once both marker + messages are ready): the
  // "New messages" divider if there's unread, else the bottom. Guarded so the
  // conv refetch after markRead doesn't yank the view.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !conv.data || !messages.data) return;
    didInit.current = true;
    requestAnimationFrame(() => {
      // A search hit → jump to and briefly highlight that message.
      if (focusMessageId) {
        const el = document.getElementById(`msg-${focusMessageId}`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.style.transition = 'background-color .4s';
          el.style.backgroundColor = 'rgba(184,134,47,0.16)';
          setTimeout(() => { el.style.backgroundColor = ''; }, 1800);
          return;
        }
      }
      if (firstUnreadId && dividerRef.current) dividerRef.current.scrollIntoView({ block: 'center' });
      else bottomRef.current?.scrollIntoView();
    });
  }, [conv.data, messages.data]); // eslint-disable-line
  // New messages while viewing → follow to the bottom, but only if the reader is
  // already near the bottom (don't yank them off the divider/backlog they're
  // reading). Always follow your own just-sent message.
  const scrollRef = useRef(null);
  const prevLen = useRef(0);
  useEffect(() => {
    if (didInit.current && msgs.length > prevLen.current) {
      const el = scrollRef.current;
      const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      const mineJustSent = msgs[msgs.length - 1]?.authorId === me;
      if (nearBottom || mineJustSent) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLen.current = msgs.length;
  }, [msgs.length]); // eslint-disable-line

  // Mark read once, only after the marker is captured; refresh the sidebar badge
  // and set this conversation's cached read state so a re-open shows no divider.
  const markReadRef = useRef(false);
  useEffect(() => {
    if (!conv.data || markReadRef.current) return; // marker is already frozen from conv.data by now
    markReadRef.current = true;
    markRead(conversationId).then(() => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.setQueryData(['conversation', conversationId], (old) => (old ? { ...old, lastReadAt: new Date().toISOString() } : old));
    }).catch(() => {});
  }, [conv.data]); // eslint-disable-line

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); }, [toast]);

  const send = useMutation({
    mutationFn: (payload) => postMessage(conversationId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const c = conv.data;
  if (conv.isError) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-ink-soft">
      {onBack && <button onClick={onBack} className="absolute left-3 top-3 rounded-lg p-1 hover:bg-paper lg:hidden" aria-label="Back">←</button>}
      <div className="text-3xl">🔒</div>
      <p className="text-sm">This conversation isn’t available.</p>
    </div>
  );
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        {messages.isLoading && <p className="px-4 py-6 text-sm text-ink-soft">Loading…</p>}
        {messages.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-soft">No messages yet. Say hello! 👋</p>}
        {messages.data?.map((m, i) => {
          const prev = messages.data[i - 1];
          const newDay = !prev || !sameDay(prev.at, m.at);
          const compact = !newDay && prev && prev.authorId === m.authorId && withinGap(prev.at, m.at) && !prev.deleted;
          return (
            <div key={m.id}>
              {newDay && <DateDivider at={m.at} />}
              {m.id === firstUnreadId && <div ref={dividerRef}><UnreadDivider /></div>}
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
        <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} autoFocus placeholder="e.g. class-7-8-team"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm lowercase outline-none focus:border-pine" />
        <span className="mt-1 block text-[11px] text-ink-soft">Group names are lowercase, so they're easy to scan.</span>
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

// Slack-style "New message": pick a recipient (a person → their DM, or an
// existing group), then type and send in one flow. Routes to the resolved
// conversation and opens it.
function NewMessageModal({ users, groups, onClose, onSent }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState(null); // {kind:'dm',userId,name,photoUrl} | {kind:'group',id,name}
  const query = q.trim().toLowerCase();
  const groupMatches = groups.filter((g) => !query || (g.name || '').toLowerCase().includes(query));
  const peopleGroups = groupByDept(users, q); // [dept, members][]

  const send = useMutation({
    mutationFn: async (payload) => {
      const convId = target.kind === 'group' ? target.id : (await openDm(target.userId)).id;
      await postMessage(convId, payload);
      return convId;
    },
    onSuccess: (convId) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages', convId] }); // show it now if that conversation is already open
      onSent(convId);
    },
  });

  return (
    <ModalShell title="New message" onClose={onClose}>
      {!target ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="To: name, role, department, or group…"
            className="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
          <div className="mt-2 max-h-80 overflow-y-auto">
            {groupMatches.length > 0 && (
              <div className="mb-1">
                <div className="rounded bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Groups</div>
                {groupMatches.map((g) => (
                  <button key={g.id} onClick={() => setTarget({ kind: 'group', id: g.id, name: g.name })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-pine-tint">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pine-tint text-pine">#</span>
                    <span className="flex-1 truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            )}
            {peopleGroups.map(([dept, members]) => (
              <div key={dept} className="mb-1">
                <div className="rounded bg-paper px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{dept} · {members.length}</div>
                {members.map((u) => (
                  <button key={u.id} onClick={() => setTarget({ kind: 'dm', userId: u.id, name: u.name, photoUrl: u.photoUrl })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-pine-tint">
                    <Avatar id={u.id} name={u.name} photoUrl={u.photoUrl} size={28} />
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="truncate text-xs text-ink-soft">{u.role}</span>
                  </button>
                ))}
              </div>
            ))}
            {groupMatches.length === 0 && peopleGroups.length === 0 && <p className="px-2 py-2 text-xs text-ink-soft">No matches.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-ink-soft">To:</span>
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-2 pr-1.5">
              {target.kind === 'group'
                ? <span className="font-semibold text-pine">#</span>
                : <Avatar id={target.userId} name={target.name} photoUrl={target.photoUrl} size={18} rounded="rounded" />}
              <span className="font-medium">{target.name}</span>
              <button onClick={() => { send.reset(); setTarget(null); }} title="Change recipient" className="text-ink-soft hover:text-brick">✕</button>
            </span>
          </div>
          <div className="mt-3">
            <MessageComposer
              onSend={(p) => send.mutateAsync(p)}
              users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
              placeholder={`Message ${target.name}`}
              autoFocus
            />
          </div>
          {send.error && <p className="mt-2 text-sm text-brick">{send.error.response?.data?.error?.message || 'Failed to send'}</p>}
        </>
      )}
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
