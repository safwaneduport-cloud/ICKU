import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetAccess, getMyAssets, getAllAssets, addAsset, assignAsset } from '../api/services.api.js';
import { getUsers } from '../api/users.api.js';

const TYPES = ['Laptop', 'Mobile', 'SIM', 'Monitor', 'Mouse', 'Keyboard', 'Access Card'];

export default function Assets() {
  const access = useQuery({ queryKey: ['asset-access'], queryFn: assetAccess, retry: false });
  const admin = access.data?.canAssets;
  const [tab, setTab] = useState('my');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-pine">IT Devices</h1>
        <p className="text-sm text-ink-soft">Employee-issued devices (laptops, phones). Company fixed assets live in AssetHub.</p>
      </div>
      <div className="flex gap-2">
        {[['my', 'My Devices'], ...(admin ? [['inv', 'Inventory']] : [])].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'my' ? <MyAssets /> : <Inventory />}
    </div>
  );
}

function MyAssets() {
  const q = useQuery({ queryKey: ['assets-mine'], queryFn: getMyAssets, retry: false });
  const rows = q.data || [];
  if (q.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!rows.length) return <p className="text-ink-soft">No assets assigned to you.</p>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((a) => (
        <div key={a.id} className="rounded-2xl border border-line bg-white p-4">
          <div className="text-sm font-medium">{a.type}</div>
          <div className="font-mono text-xs text-ink-soft">{a.tag}</div>
          <div className="mt-3 space-y-0.5 text-xs text-ink-soft">
            <div>Assigned · {a.assignedDate || '—'}</div>
            <div>Condition · {a.condition}</div>
            <div>Warranty · {a.warranty}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Inventory() {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ['assets-all'], queryFn: getAllAssets, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const assign = useMutation({ mutationFn: ({ id, userId }) => assignAsset(id, userId), onSuccess: () => qc.invalidateQueries() });
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div className="text-sm text-ink-soft">{(assets.data || []).length} assets</div>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ Add asset</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Tag</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Warranty</th></tr>
          </thead>
          <tbody>
            {(assets.data || []).map((a) => (
              <tr key={a.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5">{a.type}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.tag}</td>
                <td className="px-4 py-2.5">
                  <select value={a.assignedToId || ''} onChange={(e) => assign.mutate({ id: a.id, userId: e.target.value })}
                    className="rounded border border-line px-2 py-1 text-xs">
                    <option value="">— In stock</option>
                    {(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">{a.condition}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.warranty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddAssetModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddAssetModal({ onClose }) {
  const qc = useQueryClient();
  const [type, setType] = useState(TYPES[0]);
  const [tag, setTag] = useState('');
  const [warranty, setWarranty] = useState('');
  const mut = useMutation({
    mutationFn: () => addAsset({ type, tag: tag.trim(), warranty: warranty.trim() }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Add asset</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Asset tag</span>
            <input value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="LP-2043" />
          </label>
        </div>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Warranty until</span>
          <input value={warranty} onChange={(e) => setWarranty(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Mar 2028" />
        </label>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!tag.trim() || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Add</button>
        </div>
      </div>
    </div>
  );
}
