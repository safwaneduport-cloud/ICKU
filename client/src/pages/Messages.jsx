import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '../api/users.api.js';
import {
  getConversations, getConversation, getMessages, postMessage,
  getThread, createGroup, addMembers, openDm, markRead,
} from '../api/messages.api.js';
import { useProfile } from '../store/ProfileContext.jsx';
import MessageComposer from '../features/messages/MessageComposer.jsx';
import ChatMessage from '../features/messages/ChatMessage.jsx';
import AssignPicker from '../features/events/AssignPicker.jsx';
import { groupByDept } from '../lib/orgGroups.js';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Messages() {
  const qc = useQueryClient();
  const { openProfile } = useProfile();
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);   // the top-level message whose thread is open
  const [modal, setModal] = useState(null);      // 'group' | 'dm' | null

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: getConversations, retry: false, refetchInterval: 5000 });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const userOpts = (users.data || []).map((u) => ({ id: u.id, name: u.name, role: u.role }));

  const groups = (conversations.data || []).filter((c) => c.type === 'group');
  const dms = (conversations.data || []).filter((c) => c.type === 'dm');
  const events = (conversations.data || []).filter((c) => c.type === 'event');

  // Mark a conversation read when it's opened (clears the unread badge).
  useEffect(() => {
    if (!selectedId) return;
    setThread(null);
    markRead(selectedId).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {});
  }, [selectedId]); // eslint-disable-line

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-4">
      {/* ── Left rail ── */}
      <aside className="flex w-64 shrink-0 flex-col rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-serif text-lg font-bold text-pine">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <RailSection
            title="Groups"
            onAdd={() => setModal('group')}
            items={groups}
            selectedId={selectedId}
            onSelect={setSelectedId}
            renderIcon={(c) => <span className="text-ink-soft">#</span>}
            empty="No groups yet"
          />
          <RailSection
            title="Direct Messages"
            onAdd={() => setModal('dm')}
            items={dms}
            selectedId={selectedId}
            onSelect={setSelectedId}
            renderIcon={(c) => (
              <span className="flex h-5 w-5 items-center justify-center rounded bg-steel/15 text-[8px] font-semibold text-steel">{initials(c.name)}</span>
            )}
            empty="No direct messages yet"
          />
          <RailSection
            title="Event Messages"
            items={events}
            selectedId={selectedId}
            onSelect={setSelectedId}
            renderIcon={() => <span className="text-ink-soft">🗓</span>}
            empty="No event chats yet — join one from any event."
          />
        </div>
      </aside>

      {/* ── Chat pane ── */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-white">
        {!selectedId ? (
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

function RailSection({ title, onAdd, items, selectedId, onSelect, renderIcon, empty }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-ink-soft/60">{title}</span>
        {onAdd && <button onClick={onAdd} title={`New ${title}`} className="text-ink-soft hover:text-pine">＋</button>}
      </div>
      <div className="mt-1 space-y-0.5">
        {items.length === 0 && <p className="px-2 py-1 text-xs text-ink-soft/70">{empty}</p>}
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
              selectedId === c.id ? 'bg-pine text-white' : 'text-ink hover:bg-pine-tint'
            }`}
          >
            {renderIcon(c)}
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.unread > 0 && (
              <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${selectedId === c.id ? 'bg-white/25 text-white' : 'bg-sage text-white'}`}>
                {c.unread > 99 ? '99+' : c.unread}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatPane({ conversationId, users, onOpenThread, onOpenProfile }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => getConversation(conversationId), retry: false });
  const messages = useQuery({ queryKey: ['messages', conversationId], queryFn: () => getMessages(conversationId), retry: false, refetchInterval: 3000 });
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.data?.length]);

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
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-serif text-lg font-semibold text-pine">
            {c?.type === 'group' ? '# ' : c?.type === 'event' ? '🗓 ' : ''}{c?.name || '…'}
          </div>
          {c && (
            <div className="truncate text-xs text-ink-soft">
              {c.type === 'dm' ? 'Direct message' : c.type === 'event' ? `Event chat · ${c.members.length} people` : `${c.members.length} members`}
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
        {messages.data?.map((m) => (
          <ChatMessage key={m.id} m={m} onOpenThread={onOpenThread} onOpenProfile={onOpenProfile} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="border-t border-line p-3">
        <MessageComposer onSend={(p) => send.mutateAsync(p)} users={users} placeholder={`Message ${c?.name || ''}`} />
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
    <aside className="flex w-80 shrink-0 flex-col rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-serif text-sm font-bold text-pine">Thread</span>
        <button onClick={onClose} className="text-ink-soft hover:text-brick" aria-label="Close">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {thread.data && (
          <>
            <ChatMessage m={thread.data.parent} onOpenProfile={onOpenProfile} />
            <div className="my-1 flex items-center gap-2 px-4 text-[11px] text-ink-soft">
              <span>{thread.data.replies.length} {thread.data.replies.length === 1 ? 'reply' : 'replies'}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            {thread.data.replies.map((r) => (
              <ChatMessage key={r.id} m={r} onOpenProfile={onOpenProfile} />
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
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
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
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pine text-[10px] font-semibold text-white">{initials(u.name)}</span>
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
