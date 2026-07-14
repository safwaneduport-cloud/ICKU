import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssetMasters, getAssetAccess, listVerifications, getVerification, createVerification,
  markVerifyLine, resolveVerifyLine, setVerifyCount, closeVerification,
} from '../../api/assethub.api.js';

const inp = 'rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-pine';
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

const RESULT_OPTS = [
  ['found', 'Found', '#2C7A57', '#E2EFE7'],
  ['missing', 'Missing', '#9C3A2A', '#F3E1DC'],
  ['damaged', 'Damaged', '#9A6312', '#F5EAD4'],
  ['wrong_location', 'Wrong room', '#3F6075', '#E3EAEF'],
];

export default function VerificationTab() {
  const [openId, setOpenId] = useState(null);
  if (openId) return <SessionDetail id={openId} onBack={() => setOpenId(null)} />;
  return <SessionList onOpen={setOpenId} />;
}

function SessionList({ onOpen }) {
  const [creating, setCreating] = useState(false);
  const access = useQuery({ queryKey: ['assetAccess'], queryFn: getAssetAccess, retry: false });
  const sessions = useQuery({ queryKey: ['verifications'], queryFn: listVerifications, retry: false });
  const canRun = access.data?.isAssetAdmin || (access.data?.roles?.length > 0);
  const rows = sessions.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Physically verify a location against the register. Item-based checks each asset; count-based reconciles totals per sub-category.</p>
        {canRun && !creating && <button onClick={() => setCreating(true)} className="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">New verification</button>}
      </div>

      {creating && <NewVerification onDone={(id) => { setCreating(false); if (id) onOpen(id); }} onCancel={() => setCreating(false)} />}

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5">Verification</th><th className="px-4 py-2.5">Building</th>
                <th className="px-4 py-2.5">Mode</th><th className="px-4 py-2.5">Conducted by</th>
                <th className="px-4 py-2.5 text-right">Variance</th><th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">Loading…</td></tr>}
              {!sessions.isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">No verifications yet.</td></tr>}
              {rows.map((s) => (
                <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper/50">
                  <td className="px-4 py-2.5"><div className="font-medium text-ink">{s.title}</div><div className="text-xs text-ink-soft">{fmt(s.createdAt)}</div></td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.buildingName}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.mode === 'item' ? 'Item-based' : 'Count-based'}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.conductedBy?.name}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${s.summary.variance < 0 || s.summary.variance > 0 ? 'text-brick' : 'text-sage'}`}>{s.summary.variance === 0 ? '—' : s.summary.variance}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.status === 'open' ? 'bg-ochre-tint text-ochre' : 'bg-sage-tint text-sage'}`}>{s.status === 'open' ? 'Open' : 'Closed'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewVerification({ onDone, onCancel }) {
  const qc = useQueryClient();
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const [f, setF] = useState({ mode: 'item' });
  const [err, setErr] = useState('');
  const m = masters.data;
  const sites = (m?.sites || []).filter((s) => s.active);
  const site = sites.find((s) => s.id === f.siteId);
  const bldgs = (site?.buildings || []).filter((x) => x.active);
  const bldg = bldgs.find((x) => x.id === f.buildingId);
  const rooms = (bldg?.rooms || []).filter((r) => r.active);
  const cats = (m?.categories || []).filter((c) => c.active);

  const create = useMutation({
    mutationFn: () => createVerification(f),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['verifications'] }); onDone(s.id); },
    onError: (e) => setErr(e.response?.data?.error?.message || 'Could not start verification'),
  });

  return (
    <div className="rounded-2xl border border-pine/30 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold text-pine">New verification</h2>
        <button onClick={onCancel} className="text-sm text-ink-soft hover:text-ink">Cancel</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm sm:col-span-2 lg:col-span-3"><span className="text-ink-soft">Title</span>
          <input value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Q2 Hostel A audit" className={`${inp} mt-1 w-full`} /></label>
        <label className="block text-sm"><span className="text-ink-soft">Mode</span>
          <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={`${inp} mt-1 w-full`}>
            <option value="item">Item-based (check each asset)</option>
            <option value="count">Count-based (totals per sub-category)</option>
          </select></label>
        <label className="block text-sm"><span className="text-ink-soft">Site *</span>
          <select value={f.siteId || ''} onChange={(e) => setF({ ...f, siteId: e.target.value, buildingId: '', roomId: '' })} className={`${inp} mt-1 w-full`}>
            <option value="">Select…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="block text-sm"><span className="text-ink-soft">Building *</span>
          <select value={f.buildingId || ''} onChange={(e) => setF({ ...f, buildingId: e.target.value, roomId: '' })} disabled={!site} className={`${inp} mt-1 w-full`}>
            <option value="">Select…</option>{bldgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
        <label className="block text-sm"><span className="text-ink-soft">Room (optional)</span>
          <select value={f.roomId || ''} onChange={(e) => setF({ ...f, roomId: e.target.value })} disabled={!bldg} className={`${inp} mt-1 w-full`}>
            <option value="">Whole building</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
          </select></label>
        <label className="block text-sm"><span className="text-ink-soft">Category (optional)</span>
          <select value={f.categoryId || ''} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={`${inp} mt-1 w-full`}>
            <option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      </div>
      {err && <p className="mt-2 text-sm text-brick">{err}</p>}
      <button onClick={() => { setErr(''); create.mutate(); }} disabled={create.isPending || !f.siteId || !f.buildingId}
        className="mt-3 rounded-lg bg-pine px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
        {create.isPending ? 'Starting…' : 'Start verification'}
      </button>
    </div>
  );
}

function Chip({ label, value, tone }) {
  return <span className={`rounded-lg px-3 py-1.5 text-sm ${tone}`}><span className="font-semibold">{value}</span> {label}</span>;
}

function SessionDetail({ id, onBack }) {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['verification', id], queryFn: () => getVerification(id), retry: false });
  const [err, setErr] = useState('');
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['verification', id] }); qc.invalidateQueries({ queryKey: ['verifications'] }); qc.invalidateQueries({ queryKey: ['assetRecords'] }); qc.invalidateQueries({ queryKey: ['approvalQueue'] }); };
  const onErr = (e) => setErr(e.response?.data?.error?.message || 'Action failed');
  const mark = useMutation({ mutationFn: ({ lineId, result, note }) => markVerifyLine(id, lineId, { result, note }), onSuccess: invalidate, onError: onErr });
  const resolve = useMutation({ mutationFn: (lineId) => resolveVerifyLine(id, lineId), onSuccess: invalidate, onError: onErr });
  const count = useMutation({ mutationFn: ({ countId, actual }) => setVerifyCount(id, countId, actual), onSuccess: invalidate, onError: onErr });
  const close = useMutation({ mutationFn: () => closeVerification(id), onSuccess: invalidate, onError: onErr });

  const v = s.data;
  if (s.isLoading || !v) return <div className="py-10 text-center text-sm text-ink-soft">Loading…</div>;
  const open = v.status === 'open';
  const sum = v.summary;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-pine hover:underline">← All verifications</button>
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-semibold text-pine">{v.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${open ? 'bg-ochre-tint text-ochre' : 'bg-sage-tint text-sage'}`}>{open ? 'Open' : 'Closed'}</span>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">
              {v.mode === 'item' ? 'Item-based' : 'Count-based'} · {v.siteName} › {v.buildingName}{v.roomNumber ? ` › Room ${v.roomNumber}` : ''}{v.categoryName ? ` · ${v.categoryName}` : ''} · by {v.conductedBy?.name}
            </p>
          </div>
          {open && (
            <button onClick={() => { if (confirm('Close this verification? Unchecked items will be recorded as missing.')) close.mutate(); }} disabled={close.isPending}
              className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{close.isPending ? 'Closing…' : 'Close & finalise'}</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {v.mode === 'item' ? (
            <>
              <Chip label="checked" value={`${sum.checked}/${sum.total}`} tone="bg-paper text-ink" />
              <Chip label="found" value={sum.found} tone="bg-sage-tint text-sage" />
              <Chip label="missing" value={sum.missing} tone="bg-brick/10 text-brick" />
              <Chip label="damaged" value={sum.damaged} tone="bg-ochre-tint text-ochre" />
            </>
          ) : (
            <>
              <Chip label="expected" value={sum.expected} tone="bg-paper text-ink" />
              <Chip label="counted" value={sum.actual} tone="bg-sage-tint text-sage" />
              <Chip label="variance" value={sum.variance === 0 ? '0' : (sum.variance > 0 ? `+${sum.variance}` : sum.variance)} tone={sum.variance === 0 ? 'bg-paper text-ink' : 'bg-brick/10 text-brick'} />
            </>
          )}
        </div>
      </div>

      {err && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{err}</p>}

      {v.mode === 'item' ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Custodian</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5">Follow-up</th></tr>
              </thead>
              <tbody>
                {v.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line/60 last:border-0 align-top">
                    <td className="px-4 py-2.5"><div className="font-mono text-xs font-medium text-pine">{l.asset.assetTag}</div><div className="text-ink">{l.asset.description}</div><div className="text-xs text-ink-soft">{l.asset.room ? `Room ${l.asset.room.number}` : 'No room'}</div></td>
                    <td className="px-4 py-2.5 text-ink-soft">{l.asset.custodian?.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {RESULT_OPTS.map(([key, label, c, b]) => (
                          <button key={key} disabled={!open || mark.isPending} onClick={() => mark.mutate({ lineId: l.id, result: key })}
                            style={l.result === key ? { color: c, background: b } : {}}
                            className={`rounded-lg px-2 py-1 text-xs ${l.result === key ? 'font-medium' : 'bg-paper text-ink-soft hover:text-ink'} disabled:opacity-60`}>{label}</button>
                        ))}
                      </div>
                      {l.result === 'pending' && <span className="text-xs text-ink-soft">Not checked</span>}
                      {l.note && <p className="mt-1 text-xs text-ink-soft">“{l.note}”</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      {['missing', 'damaged'].includes(l.result) && (
                        l.resolved
                          ? <span className="text-xs text-sage">✓ {l.result === 'missing' ? 'Write-off raised' : 'Damage raised'}</span>
                          : <button disabled={resolve.isPending} onClick={() => resolve.mutate(l.id)}
                              className="rounded-lg border border-brick/40 px-2 py-1 text-xs text-brick hover:bg-brick/5 disabled:opacity-50">
                              {l.result === 'missing' ? 'Raise write-off →' : 'Raise damage →'}
                            </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr><th className="px-4 py-2.5">Sub-category</th><th className="px-4 py-2.5 text-right">Expected</th><th className="px-4 py-2.5 text-right">Actual count</th><th className="px-4 py-2.5 text-right">Variance</th></tr>
            </thead>
            <tbody>
              {v.counts.map((c) => {
                const variance = c.actual == null ? null : c.actual - c.expected;
                return (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-ink">{c.subCategory.name}</td>
                    <td className="px-4 py-2.5 text-right text-ink-soft">{c.expected}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input type="number" min={0} defaultValue={c.actual ?? ''} disabled={!open}
                        onBlur={(e) => { const val = e.target.value; if (String(val) !== String(c.actual ?? '')) count.mutate({ countId: c.id, actual: val }); }}
                        className="w-24 rounded-lg border border-line px-2 py-1 text-right disabled:bg-paper/50" />
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${variance == null ? 'text-ink-soft' : variance === 0 ? 'text-sage' : 'text-brick'}`}>
                      {variance == null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
