import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import {
  getMasterTypes, getMasterOptions, createMasterOption, updateMasterOption, deleteMasterOption,
} from '../api/masters.api.js';

export default function MasterData() {
  const { user } = useAuth();
  const isHr = user?.id === 'ceo' || user?.role === 'HR Head';
  const [type, setType] = useState(null);

  const types = useQuery({ queryKey: ['masterTypes'], queryFn: getMasterTypes, retry: false, enabled: isHr });
  const activeType = type || types.data?.[0]?.type || null;

  if (!isHr) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Master Data</h1>
        <p className="text-sm text-ink-soft">This section is available to HR and Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl font-bold text-pine">Master Data</h1>
        <p className="text-sm text-ink-soft">Manage the dropdown values used across onboarding, attendance, leave and profiles.</p>
      </div>

      <div className="flex gap-4">
        {/* type rail */}
        <aside className="w-64 shrink-0 rounded-2xl border border-line bg-white p-2">
          <div className="max-h-[70vh] space-y-0.5 overflow-y-auto">
            {(types.data || []).map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  activeType === t.type ? 'bg-pine text-white' : 'text-ink hover:bg-pine-tint'
                }`}
              >
                <span className="truncate">{t.label}</span>
                <span className={`ml-2 shrink-0 rounded-full px-1.5 text-[10px] ${activeType === t.type ? 'bg-white/25 text-white' : 'bg-paper text-ink-soft'}`}>
                  {t.active}/{t.count}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* options panel */}
        <section className="min-w-0 flex-1">
          {activeType && <OptionsPanel type={activeType} label={types.data?.find((t) => t.type === activeType)?.label} />}
        </section>
      </div>
    </div>
  );
}

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function WeekdayChips({ offDays, onChange }) {
  const toggle = (i) => onChange(offDays.includes(i) ? offDays.filter((x) => x !== i).sort() : [...offDays, i].sort());
  return (
    <div className="flex gap-0.5">
      {WD.map((d, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          title={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}
          className={`h-6 w-6 rounded text-[10px] font-semibold ${offDays.includes(i) ? 'bg-pine text-white' : 'bg-paper text-ink-soft hover:bg-pine-tint'}`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function OptionsPanel({ type, label }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState('');
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [err, setErr] = useState('');

  const options = useQuery({ queryKey: ['masterOptions', type, q], queryFn: () => getMasterOptions(type, q), retry: false });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['masterOptions', type] });
    qc.invalidateQueries({ queryKey: ['masterTypes'] });
  };
  const onErr = (e) => setErr(e.response?.data?.error?.message || 'Something went wrong');

  const isWeeklyOff = type === 'weeklyOffPolicy';
  const create = useMutation({ mutationFn: () => createMasterOption(type, adding.trim()), onSuccess: () => { setAdding(''); setErr(''); refresh(); }, onError: onErr });
  const toggle = useMutation({ mutationFn: ({ id, active }) => updateMasterOption(id, { active }), onSuccess: refresh, onError: onErr });
  const setOffDays = useMutation({ mutationFn: ({ id, offDays }) => updateMasterOption(id, { meta: { offDays } }), onSuccess: refresh, onError: onErr });
  const rename = useMutation({ mutationFn: () => updateMasterOption(editId, { value: editVal.trim() }), onSuccess: () => { setEditId(null); setErr(''); refresh(); }, onError: onErr });
  const del = useMutation({ mutationFn: (id) => deleteMasterOption(id), onSuccess: () => { setErr(''); refresh(); }, onError: onErr });

  return (
    <div className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-pine">{label}</h2>
        <span className="text-xs text-ink-soft">{options.data?.length ?? '—'} shown</span>
        <div className="ml-auto flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="w-40 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-pine" />
        </div>
      </div>

      {/* add row */}
      <div className="flex gap-2 border-b border-line px-4 py-3">
        <input value={adding} onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) create.mutate(); }}
          placeholder={`New ${label?.toLowerCase()}…`}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />
        <button onClick={() => create.mutate()} disabled={!adding.trim() || create.isPending}
          className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add</button>
      </div>

      {err && <div className="border-b border-line bg-brick/5 px-4 py-2 text-sm text-brick">{err}</div>}

      <div className="max-h-[55vh] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-line bg-white text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-2">Value</th>
              {isWeeklyOff && <th className="px-4 py-2">Off days</th>}
              <th className="px-4 py-2">Assigned</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {options.isLoading && <tr><td colSpan={5} className="px-4 py-4 text-ink-soft">Loading…</td></tr>}
            {options.data?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-soft">No options{q ? ' match your search' : ''}.</td></tr>}
            {options.data?.map((o) => (
              <tr key={o.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2">
                  {editId === o.id ? (
                    <input value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') rename.mutate(); if (e.key === 'Escape') setEditId(null); }}
                      className="w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-pine" />
                  ) : (
                    <span className={o.active ? '' : 'text-ink-soft line-through'}>{o.value}</span>
                  )}
                </td>
                {isWeeklyOff && (
                  <td className="px-4 py-2">
                    <WeekdayChips
                      offDays={o.meta?.offDays || []}
                      onChange={(offDays) => setOffDays.mutate({ id: o.id, offDays })}
                    />
                  </td>
                )}
                <td className="px-4 py-2 text-ink-soft">{o.inUse}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${o.active ? 'bg-sage-tint text-sage' : 'bg-paper text-ink-soft'}`}>
                    {o.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2 text-xs">
                    {editId === o.id ? (
                      <>
                        <button onClick={() => rename.mutate()} className="font-medium text-pine">Save</button>
                        <button onClick={() => setEditId(null)} className="text-ink-soft">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(o.id); setEditVal(o.value); setErr(''); }} className="text-steel hover:underline">Edit</button>
                        <button onClick={() => toggle.mutate({ id: o.id, active: !o.active })} className="text-ochre hover:underline">
                          {o.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => { if (o.inUse > 0) { setErr(`"${o.value}" is assigned to ${o.inUse} employee(s) — reassign or deactivate instead.`); } else if (confirm(`Delete "${o.value}"?`)) del.mutate(o.id); }}
                          className={o.inUse > 0 ? 'text-ink-soft/50' : 'text-brick hover:underline'}
                          title={o.inUse > 0 ? 'In use — cannot delete' : 'Delete'}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
