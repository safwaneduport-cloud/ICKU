import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { onbAccess, getOnboardings, addJoiner, toggleOnbItem } from '../api/lifecycle.api.js';
import { getDepartments } from '../api/departments.api.js';

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Onboarding() {
  const access = useQuery({ queryKey: ['onb-access'], queryFn: onbAccess, retry: false });
  const canManage = access.data?.canManage;
  const checklist = access.data?.checklist || [];

  if (access.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl font-bold text-pine">Onboarding</h1>
        <div className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-ink-soft">
          Onboarding is managed by HR. You don't have access.
        </div>
      </div>
    );
  }
  return <Manager checklist={checklist} />;
}

function Manager({ checklist }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['onboardings'], queryFn: getOnboardings, retry: false });
  const toggle = useMutation({ mutationFn: ({ id, item }) => toggleOnbItem(id, item), onSuccess: () => qc.invalidateQueries() });
  const [open, setOpen] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Onboarding</h1>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ Add joiner</button>
      </div>
      <p className="text-sm text-ink-soft">Track new joiners from offer through the joining checklist.</p>

      <div className="space-y-3">
        {(list.data || []).map((o) => (
          <div key={o.id} className="rounded-2xl border border-line bg-white">
            <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: o.department?.color || '#134535' }}>{initials(o.name)}</span>
              <span className="flex-1">
                <span className="block font-medium">{o.name}</span>
                <span className="block text-xs text-ink-soft">{o.designation} · joins {o.joinDate}</span>
              </span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${o.offer === 'Accepted' ? 'bg-sage-tint text-sage' : 'bg-ochre-tint text-ochre'}`}>Offer {o.offer}</span>
              <span className="w-12 text-right font-mono text-sm">{o.progress}%</span>
            </button>
            {open === o.id && (
              <div className="border-t border-line px-4 py-3">
                <div className="mb-3 h-1.5 w-full rounded-full bg-paper">
                  <div className="h-1.5 rounded-full bg-pine" style={{ width: `${o.progress}%` }} />
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {checklist.map((item) => {
                    const done = o.done.includes(item);
                    return (
                      <button key={item} onClick={() => toggle.mutate({ id: o.id, item })}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-paper">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${done ? 'border-sage bg-sage text-white' : 'border-line'}`}>{done ? '✓' : ''}</span>
                        <span className={done ? 'text-ink-soft line-through' : ''}>{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {(list.data || []).length === 0 && <p className="text-ink-soft">No active onboardings.</p>}
      </div>

      {showAdd && <AddJoinerModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddJoinerModal({ onClose }) {
  const qc = useQueryClient();
  const depts = useQuery({ queryKey: ['departments'], queryFn: getDepartments, retry: false });
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [departmentId, setDepartmentId] = useState('academics');
  const [joinDate, setJoinDate] = useState('');
  const mut = useMutation({
    mutationFn: () => addJoiner({ name: name.trim(), designation: designation.trim(), departmentId, joinDate }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Add joiner</h3>
        <label className="mt-4 block text-sm"><span className="text-ink-soft">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Full name" />
        </label>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Designation</span>
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="e.g. Faculty — Chemistry" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Department</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
              {(depts.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Join date</span>
            <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
          </label>
        </div>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!name.trim() || !joinDate || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Add joiner</button>
        </div>
      </div>
    </div>
  );
}
