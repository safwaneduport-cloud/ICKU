import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssetMasters, listAssetRecords, assignAssetRoom, bulkAssignRoom } from '../../api/assethub.api.js';
import { STATUS } from './meta.js';

const inp = 'rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine';
const ASSIGNABLE = ['void', 'disposed', 'written_off'];

export default function AssignRooms() {
  const qc = useQueryClient();
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const [siteId, setSiteId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [target, setTarget] = useState('');
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState('');

  const m = masters.data;
  const sites = (m?.sites || []).filter((s) => s.active);
  const site = sites.find((s) => s.id === siteId);
  const bldgs = (site?.buildings || []).filter((x) => x.active);
  const bldg = bldgs.find((x) => x.id === buildingId);
  const rooms = (bldg?.rooms || []).filter((r) => r.active);

  const assets = useQuery({
    queryKey: ['assetRecords', { buildingId }],
    queryFn: () => listAssetRecords({ buildingId }),
    enabled: !!buildingId, retry: false,
  });
  const rows = (assets.data || []).filter((a) => !ASSIGNABLE.includes(a.status));

  const refresh = () => { qc.invalidateQueries({ queryKey: ['assetRecords'] }); setSel(new Set()); };
  const single = useMutation({
    mutationFn: ({ id, roomId }) => assignAssetRoom(id, roomId || null),
    onSuccess: refresh, onError: (e) => setErr(e.response?.data?.error?.message || 'Failed to assign room'),
  });
  const bulk = useMutation({
    mutationFn: () => bulkAssignRoom([...sel], target || null),
    onSuccess: refresh, onError: (e) => setErr(e.response?.data?.error?.message || 'Failed to assign rooms'),
  });

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && sel.size === rows.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((a) => a.id)));

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">
        Assign or move assets between rooms within a building. Pick a building, select assets, choose the target room, and assign — or change a single asset's room inline.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setBuildingId(''); setSel(new Set()); }} className={inp}>
          <option value="">Select site…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setSel(new Set()); }} disabled={!site} className={inp}>
          <option value="">Select building…</option>{bldgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      {!buildingId && <p className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-ink-soft">Choose a site and building to list its assets.</p>}

      {buildingId && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-4 py-3">
            <span className="text-sm font-medium text-ink">{sel.size} selected</span>
            <span className="text-ink-soft">→</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={inp}>
              <option value="">Clear room (no room)</option>{rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}</option>)}
            </select>
            <button onClick={() => bulk.mutate()} disabled={!sel.size || bulk.isPending}
              className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {bulk.isPending ? 'Assigning…' : 'Assign selected'}
            </button>
          </div>

          {err && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{err}</p>}

          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className="px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                    <th className="px-3 py-2.5">Asset ID</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.isLoading && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-soft">Loading…</td></tr>}
                  {!assets.isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-soft">No assignable assets in this building.</td></tr>}
                  {rows.map((a) => {
                    const st = STATUS[a.status] || {};
                    return (
                      <tr key={a.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
                        <td className="px-3 py-2 font-mono text-xs font-medium text-pine">{a.assetTag}</td>
                        <td className="px-3 py-2">{a.description}</td>
                        <td className="px-3 py-2"><span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: st.c, background: st.b }}>{st.label}</span></td>
                        <td className="px-3 py-2">
                          <select value={a.room?.id || ''} onChange={(e) => single.mutate({ id: a.id, roomId: e.target.value })} className="rounded-lg border border-line px-2 py-1 text-sm">
                            <option value="">No room</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
