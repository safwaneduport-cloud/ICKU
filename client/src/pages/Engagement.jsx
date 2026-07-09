import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { useProfile } from '../store/ProfileContext.jsx';
import { getEngagement, giveKudos, votePoll } from '../api/engagement.api.js';
import { getUsers } from '../api/users.api.js';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Avatar({ name, color }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: color || '#134535' }}>
      {initials(name)}
    </span>
  );
}

export default function Engagement() {
  const q = useQuery({ queryKey: ['engagement'], queryFn: getEngagement, retry: false });
  const { openProfile } = useProfile();
  const [showKudos, setShowKudos] = useState(false);
  const d = q.data;

  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Engagement</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Birthdays */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold">🎂 Birthdays · {d.month}</h2>
            <span className="text-xs text-ink-soft">{d.birthdays.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {d.birthdays.length === 0 && <p className="text-sm text-ink-soft">No birthdays this month.</p>}
            {d.birthdays.map((u) => (
              <button key={u.id} onClick={() => openProfile(u.id)} className="flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-pine-tint">
                <Avatar name={u.name} color={u.color} />
                <span className="flex-1 text-sm font-medium">{u.name}</span>
                <span className="text-xs text-ink-soft">{d.month.slice(0, 3)} {u.day}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Anniversaries */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold">🎉 Work anniversaries · {d.month}</h2>
            <span className="text-xs text-ink-soft">{d.anniversaries.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {d.anniversaries.length === 0 && <p className="text-sm text-ink-soft">No anniversaries this month.</p>}
            {d.anniversaries.map((u) => (
              <button key={u.id} onClick={() => openProfile(u.id)} className="flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-pine-tint">
                <Avatar name={u.name} color={u.color} />
                <span className="flex-1 text-sm font-medium">{u.name}</span>
                <span className="text-xs text-ink-soft">{u.years} yr{u.years > 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Poll */}
        {d.poll && <PollCard poll={d.poll} />}
      </div>

      {/* Recognition wall */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">👏 Recognition wall</h2>
          <button onClick={() => setShowKudos(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">Give kudos</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {d.kudos.map((k) => (
            <div key={k.id} className="rounded-xl border border-line p-4">
              <div className="text-sm">
                <button onClick={() => openProfile(k.from.id)} className="font-semibold text-pine hover:underline">{k.from.name}</button>
                <span className="text-ink-soft"> → </span>
                <button onClick={() => openProfile(k.to.id)} className="font-semibold text-pine hover:underline">{k.to.name}</button>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{k.message}</p>
            </div>
          ))}
        </div>
      </section>

      {showKudos && <GiveKudosModal onClose={() => setShowKudos(false)} />}
    </div>
  );
}

function PollCard({ poll }) {
  const qc = useQueryClient();
  const vote = useMutation({ mutationFn: (optionId) => votePoll(poll.id, optionId), onSuccess: () => qc.invalidateQueries({ queryKey: ['engagement'] }) });
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-serif text-lg font-semibold">📊 Team poll</h2>
      <p className="mt-1 text-sm text-ink-soft">{poll.question}</p>
      <div className="mt-3 space-y-2">
        {poll.options.map((o) => {
          const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const mine = poll.myVote === o.id;
          return (
            <button key={o.id} onClick={() => vote.mutate(o.id)} disabled={vote.isPending}
              className="relative block w-full overflow-hidden rounded-lg border border-line px-3 py-2 text-left text-sm">
              <span className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${pct}%`, background: mine ? '#E4EDE7' : '#F1EFE8' }} />
              <span className="relative flex justify-between">
                <span className={mine ? 'font-semibold text-pine' : ''}>{o.label}{mine ? ' ✓' : ''}</span>
                <span className="text-ink-soft">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-ink-soft">{poll.totalVotes} votes</div>
    </section>
  );
}

function GiveKudosModal({ onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [toId, setToId] = useState('');
  const [message, setMessage] = useState('');
  const mut = useMutation({
    mutationFn: () => giveKudos(toId, message.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['engagement'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Give kudos</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">To</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
            <option value="">Select a colleague…</option>
            {(users.data || []).filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Message</span>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Recognise great work…" />
        </label>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!toId || !message.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Give kudos</button>
        </div>
      </div>
    </div>
  );
}
