import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAssetRecords, getAssetMasters } from '../../api/assethub.api.js';
import { STATUS, inr } from './meta.js';
import AssetDetail from './AssetDetail.jsx';

const sel = 'rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine';

export default function RegisterTab() {
  const [f, setF] = useState({ q: '', status: '', categoryId: '', siteId: '' });
  const [openId, setOpenId] = useState(null);
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const rows = useQuery({ queryKey: ['assetRecords', params], queryFn: () => listAssetRecords(params), retry: false });

  const cats = (masters.data?.categories || []);
  const sites = (masters.data?.sites || []);
  const list = rows.data || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search tag, description or serial…"
          className={`${sel} min-w-56 flex-1`} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={sel}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={sel}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })} className={sel}>
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5">Asset ID</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Custodian</th>
                <th className="px-4 py-2.5 text-right">Value</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">Loading…</td></tr>}
              {!rows.isLoading && list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">No assets yet. Add one from the <span className="font-medium text-pine">Create</span> tab.</td></tr>
              )}
              {list.map((a) => {
                const st = STATUS[a.status] || { label: a.status, c: '#5E635B', b: '#F1EFE8' };
                return (
                  <tr key={a.id} onClick={() => setOpenId(a.id)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-pine">{a.assetTag}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-ink">{a.description}</div>
                      <div className="text-xs text-ink-soft">{a.subCategory?.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-soft">{a.site?.code} · {a.building?.code}{a.room ? ` · ${a.room.number}` : ''}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{a.custodian?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{inr(a.totalValue)}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: st.c, background: st.b }}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length > 0 && <div className="border-t border-line px-4 py-2 text-xs text-ink-soft">{list.length} asset{list.length === 1 ? '' : 's'}{list.length === 500 ? ' (showing first 500)' : ''}</div>}
      </div>

      {openId && <AssetDetail assetId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
