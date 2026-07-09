import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkspaces, getWorkspace } from '../api/collab.api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATE = {
  overdue: { label: 'Overdue', c: '#9C3A2A', b: '#F3E1DC' }, current: { label: 'Current', c: '#134535', b: '#E4EDE7' },
  upcoming: { label: 'Upcoming', c: '#3F6075', b: '#E3EAEF' }, undated: { label: 'Undated', c: '#9A6312', b: '#F5EAD4' },
  completed: { label: 'Completed', c: '#2C7A57', b: '#E2EFE7' },
};
const TYPE_COLOR = { SOP: '#134535', Policy: '#9C3A2A', Guide: '#3F6075', FAQ: '#9A6312', Manual: '#2C7A57' };
const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Workspaces() {
  const [deptId, setDeptId] = useState(null);
  if (deptId) return <Hub deptId={deptId} onBack={() => setDeptId(null)} />;
  return <Grid onOpen={setDeptId} />;
}

function Grid({ onOpen }) {
  const q = useQuery({ queryKey: ['workspaces'], queryFn: getWorkspaces, retry: false });
  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Workspaces</h1>
      <p className="text-sm text-ink-soft">Each department's people, events and knowledge in one place.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data || []).map((w) => (
          <button key={w.id} onClick={() => onOpen(w.id)} className="rounded-2xl border border-line bg-white p-5 text-left hover:border-pine">
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg" style={{ background: w.color }} />
              <div className="font-serif text-lg font-semibold">{w.name}</div>
            </div>
            <div className="mt-3 flex gap-4 text-sm text-ink-soft">
              <span><strong className="text-ink">{w.members}</strong> people</span>
              <span><strong className="text-ink">{w.events}</strong> events</span>
              <span><strong className="text-ink">{w.docs}</strong> docs</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Hub({ deptId, onBack }) {
  const q = useQuery({ queryKey: ['workspace', deptId], queryFn: () => getWorkspace(deptId), retry: false });
  const w = q.data;
  if (!w) return <p className="text-ink-soft">Loading…</p>;
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-medium text-pine">← All workspaces</button>
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-lg" style={{ background: w.department.color }} />
        <h1 className="font-serif text-3xl font-bold text-pine">{w.department.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">People · {w.members.length}</div>
          <div className="mt-3 space-y-2">
            {w.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-semibold text-white" style={{ background: w.department.color }}>{initials(m.name)}</span>
                <span className="flex-1">{m.name}</span>
                <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px]">{m.tier}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Events · {w.events.length}</div>
          <div className="mt-3 space-y-2">
            {w.events.length === 0 && <p className="text-sm text-ink-soft">No events.</p>}
            {w.events.map((e) => {
              const s = STATE[e.state] || STATE.upcoming;
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-ink-soft">{e.status === 'confirmed' && e.triggerMonth ? `${MONTHS[e.triggerMonth - 1]} ${e.triggerDay}` : '—'}</span>
                  <span className="flex-1">{e.name}</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: s.c, background: s.b }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Knowledge · {w.docs.length}</div>
          <div className="mt-3 space-y-2">
            {w.docs.length === 0 && <p className="text-sm text-ink-soft">No documents.</p>}
            {w.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: TYPE_COLOR[d.type] || '#5E635B', background: '#F1EFE8' }}>{d.type}</span>
                <span className="flex-1">{d.title}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
