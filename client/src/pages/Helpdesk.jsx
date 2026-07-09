import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { helpdeskAccess, getMyTickets, getTicketQueue, createTicket, assignTicket, setTicketStatus } from '../api/services.api.js';

const CATEGORIES = ['HR query', 'Payroll issue', 'Access request', 'IT support', 'Other'];
const STATUS = {
  open: { c: '#9A6312', b: '#F5EAD4' },
  assigned: { c: '#3F6075', b: '#E3EAEF' },
  resolved: { c: '#2C7A57', b: '#E2EFE7' },
  closed: { c: '#5E635B', b: '#F1EFE8' },
};

function Pill({ status }) {
  const m = STATUS[status] || STATUS.open;
  return <span className="rounded px-2 py-0.5 text-xs font-medium capitalize" style={{ color: m.c, background: m.b }}>{status}</span>;
}

export default function Helpdesk() {
  const access = useQuery({ queryKey: ['hd-access'], queryFn: helpdeskAccess, retry: false });
  const agent = access.data?.canHelpdesk;
  const [tab, setTab] = useState('my');
  const [showNew, setShowNew] = useState(false);

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
      {tab === 'my' ? <MyTickets /> : <Queue />}
      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function MyTickets() {
  const q = useQuery({ queryKey: ['hd-mine'], queryFn: getMyTickets, retry: false });
  const rows = q.data || [];
  return (
    <div className="rounded-2xl border border-line bg-white">
      {rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No tickets raised.</p>}
      {rows.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{t.subject}</div>
            <div className="text-xs text-ink-soft">{t.category} · {t.raised}{t.assignee ? ` · ${t.assignee.name}` : ''}</div>
          </div>
          <Pill status={t.status} />
        </div>
      ))}
    </div>
  );
}

function Queue() {
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
          <div className="min-w-[240px] flex-1">
            <div className="font-medium">{t.subject}</div>
            <div className="text-xs text-ink-soft">{t.user.name} · {t.category} · {t.raised}{t.assignee ? ` · assigned to ${t.assignee.name}` : ''}</div>
          </div>
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

function NewTicketModal({ onClose }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const mut = useMutation({
    mutationFn: () => createTicket({ category, subject: subject.trim() }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Raise a ticket</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Describe your issue…" autoFocus />
        </label>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!subject.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Raise ticket</button>
        </div>
      </div>
    </div>
  );
}
