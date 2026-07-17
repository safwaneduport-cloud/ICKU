import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import {
  helpdeskAccess, getMyTickets, getTicketQueue, createTicket, assignTicket, setTicketStatus,
  getTicket, addTicketComment, markTicketRead,
} from '../api/services.api.js';

const STATUS = {
  open: { c: '#9A6312', b: '#F5EAD4' },
  assigned: { c: '#3F6075', b: '#E3EAEF' },
  resolved: { c: '#2C7A57', b: '#E2EFE7' },
  closed: { c: '#5E635B', b: '#F1EFE8' },
};
const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDT = (d) => (d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Pill({ status }) {
  const m = STATUS[status] || STATUS.open;
  return <span className="rounded px-2 py-0.5 text-xs font-medium capitalize" style={{ color: m.c, background: m.b }}>{status}</span>;
}

export default function Helpdesk() {
  const access = useQuery({ queryKey: ['hd-access'], queryFn: helpdeskAccess, retry: false });
  const agent = access.data?.canHelpdesk;
  const [tab, setTab] = useState('my');
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Helpdesk</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ Raise ticket</button>
      </div>
      <div className="flex gap-2">
        {[['my', 'My Tickets'], ...(agent ? [['queue', 'Queue']] : [])].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'queue' && access.data?.handles && (
        <p className="-mt-3 text-xs text-ink-soft">Showing the categories you handle: {access.data.handles.join(' · ')}</p>
      )}
      {tab === 'my' ? <MyTickets onOpen={setOpenId} /> : <Queue onOpen={setOpenId} />}
      {showNew && <NewTicketModal categories={access.data?.categories || []} onClose={() => setShowNew(false)} onCreated={(t) => { setShowNew(false); setOpenId(t.id); }} />}
      {openId && <TicketDrawer id={openId} agent={agent} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function MyTickets({ onOpen }) {
  const q = useQuery({ queryKey: ['hd-mine'], queryFn: getMyTickets, retry: false });
  const rows = q.data || [];
  return (
    <div className="rounded-2xl border border-line bg-white">
      {rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No tickets raised.</p>}
      {rows.map((t) => (
        <button key={t.id} onClick={() => onOpen(t.id)} className="flex w-full flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-paper/50">
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{t.subject}</div>
            <div className="text-xs text-ink-soft">{t.category} · {t.raised}{t.assignee ? ` · ${t.assignee.name}` : ''}</div>
          </div>
          <Pill status={t.status} />
        </button>
      ))}
    </div>
  );
}

function Queue({ onOpen }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hd-queue'], queryFn: getTicketQueue, retry: false });
  const assign = useMutation({ mutationFn: (id) => assignTicket(id), onSuccess: () => qc.invalidateQueries() });
  const setStatus = useMutation({ mutationFn: ({ id, status }) => setTicketStatus(id, status), onSuccess: () => qc.invalidateQueries() });
  const rows = q.data || [];

  return (
    <div className="rounded-2xl border border-line bg-white">
      {rows.length === 0 && <p className="px-4 py-6 text-ink-soft">Queue is empty.</p>}
      {rows.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <button onClick={() => onOpen(t.id)} className="min-w-[240px] flex-1 text-left hover:underline">
            <div className="font-medium">{t.subject}</div>
            <div className="text-xs text-ink-soft">{t.user.name} · {t.category} · {t.raised}{t.assignee ? ` · assigned to ${t.assignee.name}` : ''}</div>
          </button>
          <Pill status={t.status} />
          <div className="flex gap-2">
            {t.status === 'open' && <button onClick={() => assign.mutate(t.id)} className="rounded border border-line px-2.5 py-1 text-xs hover:border-pine">Assign to me</button>}
            {(t.status === 'open' || t.status === 'assigned') && <button onClick={() => setStatus.mutate({ id: t.id, status: 'resolved' })} className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white">Resolve</button>}
            {t.status === 'resolved' && <button onClick={() => setStatus.mutate({ id: t.id, status: 'closed' })} className="rounded border border-line px-2.5 py-1 text-xs">Close</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Ticket detail + the conversation between the raiser and the agent.
function TicketDrawer({ id, agent, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const q = useQuery({ queryKey: ['hd-ticket', id], queryFn: () => getTicket(id), retry: false });
  const t = q.data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hd-ticket', id] });
    qc.invalidateQueries({ queryKey: ['hd-mine'] });
    qc.invalidateQueries({ queryKey: ['hd-queue'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  // Opening the ticket marks the thread read (clears the bell item).
  useEffect(() => { markTicketRead(id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {}); }, [id]); // eslint-disable-line

  const comment = useMutation({ mutationFn: () => addTicketComment(id, body), onSuccess: () => { setBody(''); refresh(); } });
  const assign = useMutation({ mutationFn: () => assignTicket(id), onSuccess: refresh });
  const status = useMutation({ mutationFn: (s) => setTicketStatus(id, s), onSuccess: refresh });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-paper" onClick={(e) => e.stopPropagation()}>
        {!t ? <p className="p-6 text-ink-soft">Loading…</p> : (
          <>
            <header className="shrink-0 border-b border-line bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Pill status={t.status} />
                    <span className="text-xs text-ink-soft">{t.category}</span>
                  </div>
                  <h2 className="mt-1 font-serif text-xl font-bold text-pine">{t.subject}</h2>
                  <p className="text-xs text-ink-soft">
                    Raised by {t.user.name} · {t.raised}{t.assignee ? ` · assigned to ${t.assignee.name}` : ' · unassigned'}
                  </p>
                </div>
                <button onClick={onClose} className="rounded-lg p-1.5 text-ink-soft hover:bg-paper">✕</button>
              </div>
              {agent && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.status === 'open' && <button onClick={() => assign.mutate()} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-pine">Assign to me</button>}
                  {(t.status === 'open' || t.status === 'assigned') && <button onClick={() => status.mutate('resolved')} className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white">Resolve</button>}
                  {t.status === 'resolved' && <button onClick={() => status.mutate('closed')} className="rounded-lg border border-line px-3 py-1.5 text-xs">Close</button>}
                  {t.status === 'closed' && <button onClick={() => status.mutate('assigned')} className="rounded-lg border border-line px-3 py-1.5 text-xs">Re-open</button>}
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Conversation</p>
              {t.comments.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">No replies yet — add the first one below.</p>}
              <div className="space-y-3">
                {t.comments.map((c) => {
                  const mine = c.author.id === user?.id;
                  return (
                    <div key={c.id} className="flex gap-2">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white ${mine ? 'bg-pine' : 'bg-steel'}`}>
                        {initials(c.author.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-ink">{mine ? 'You' : c.author.name}</span>
                          <span className="text-[11px] text-ink-soft">{fmtDT(c.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm text-ink">{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {t.status !== 'closed' ? (
              <div className="shrink-0 border-t border-line bg-white p-3">
                <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (body.trim()) comment.mutate(); } }}
                  placeholder="Write a reply…  (Enter to send, Shift+Enter for a new line)"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
                <div className="mt-2 flex justify-end">
                  <button onClick={() => comment.mutate()} disabled={!body.trim() || comment.isPending}
                    className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {comment.isPending ? 'Sending…' : 'Reply'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="shrink-0 border-t border-line bg-white p-3 text-center text-xs text-ink-soft">This ticket is closed.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NewTicketModal({ categories, onClose, onCreated }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState(categories[0] || '');
  const [subject, setSubject] = useState('');
  const mut = useMutation({
    mutationFn: () => createTicket({ category, subject: subject.trim() }),
    onSuccess: (t) => { qc.invalidateQueries(); onCreated(t); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Raise a ticket</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Describe your issue…" autoFocus />
        </label>
        <p className="mt-2 text-[11px] text-ink-soft">You can add details and chat with the helpdesk once it's raised.</p>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!subject.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Raise ticket</button>
        </div>
      </div>
    </div>
  );
}
