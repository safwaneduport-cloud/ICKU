import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '../../api/users.api.js';
import { openEventConversation, getMessages, postMessage, getThread } from '../../api/messages.api.js';
import { useProfile } from '../../store/ProfileContext.jsx';
import MessageComposer from './MessageComposer.jsx';
import ChatMessage from './ChatMessage.jsx';

// The event's chat, embedded in the event drawer. It's the SAME conversation
// that shows up under Messages → Event Messages, so posting here or there is
// interchangeable. Threads expand inline (the drawer is narrow).
export default function EventChat({ eventId }) {
  const qc = useQueryClient();
  const { openProfile } = useProfile();
  const [expanded, setExpanded] = useState(null);

  const conv = useQuery({ queryKey: ['event-conv', eventId], queryFn: () => openEventConversation(eventId), retry: false });
  const cid = conv.data?.id;

  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const userOpts = (users.data || []).map((u) => ({ id: u.id, name: u.name, role: u.role }));

  const messages = useQuery({
    queryKey: ['messages', cid],
    queryFn: () => getMessages(cid),
    enabled: !!cid,
    retry: false,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: (payload) => postMessage(cid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', cid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <section className="mt-4 rounded-2xl border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Discussion</div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
        {(!cid || messages.isLoading) && <p className="px-3 py-4 text-sm text-ink-soft">Loading…</p>}
        {messages.data?.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-soft">No messages yet. Start the conversation 👋</p>}
        {messages.data?.map((m) => (
          <div key={m.id}>
            <ChatMessage m={m} conversationId={cid}
              onOpenThread={() => setExpanded(expanded === m.id ? null : m.id)}
              onOpenProfile={openProfile}
              onChanged={() => qc.invalidateQueries({ queryKey: ['messages', cid] })}
              onRemind={() => qc.invalidateQueries({ queryKey: ['notifications'] })} />
            {expanded === m.id && <InlineThread conversationId={cid} parentId={m.id} users={userOpts} onOpenProfile={openProfile} />}
          </div>
        ))}
      </div>
      {cid && (
        <div className="mt-3">
          <MessageComposer onSend={(p) => send.mutateAsync(p)} users={userOpts} placeholder="Message this event…" />
        </div>
      )}
    </section>
  );
}

function InlineThread({ conversationId, parentId, users, onOpenProfile }) {
  const qc = useQueryClient();
  const thread = useQuery({ queryKey: ['thread', parentId], queryFn: () => getThread(parentId), retry: false, refetchInterval: 3000 });
  const reply = useMutation({
    mutationFn: (payload) => postMessage(conversationId, { ...payload, parentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', parentId] });
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
  return (
    <div className="ml-11 border-l-2 border-pine-tint pl-1">
      {thread.data?.replies.map((r) => <ChatMessage key={r.id} m={r} conversationId={conversationId} onOpenProfile={onOpenProfile}
        onChanged={() => qc.invalidateQueries({ queryKey: ['thread', parentId] })} />)}
      <div className="p-2">
        <MessageComposer onSend={(p) => reply.mutateAsync(p)} users={users} placeholder="Reply in thread…" />
      </div>
    </div>
  );
}
