import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssetMasters, bulkCreateAssets } from '../../api/assethub.api.js';
import { getUsers } from '../../api/users.api.js';
import { uploadFile } from '../../api/files.api.js';
import { groupByDept } from '../../lib/orgGroups.js';
import { inr } from './meta.js';

const inp = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine';
const Field = ({ label, req, children, hint }) => (
  <label className="block text-sm">
    <span className="text-ink-soft">{label} {req && <span className="text-brick">*</span>}</span>
    <div className="mt-1">{children}</div>
    {hint && <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>}
  </label>
);

export default function BulkCreate({ onDone }) {
  const qc = useQueryClient();
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [b, setB] = useState({});          // base fields
  const [qty, setQty] = useState(5);
  const [units, setUnits] = useState(() => Array.from({ length: 5 }, () => ({ roomId: '', serialNumber: '' })));
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setB((s) => ({ ...s, [k]: v }));

  const m = masters.data;
  const cats = (m?.categories || []).filter((c) => c.active);
  const cat = cats.find((c) => c.id === b.categoryId);
  const subs = (cat?.subCategories || []).filter((s) => s.active);
  const sites = (m?.sites || []).filter((s) => s.active);
  const site = sites.find((s) => s.id === b.siteId);
  const bldgs = (site?.buildings || []).filter((x) => x.active);
  const bldg = bldgs.find((x) => x.id === b.buildingId);
  const rooms = (bldg?.rooms || []).filter((r) => r.active);

  const perUnit = useMemo(() => {
    const t = b.taxableValue !== undefined && b.taxableValue !== '' ? Number(b.taxableValue) : null;
    const g = b.gstAmount !== undefined && b.gstAmount !== '' ? Number(b.gstAmount) : null;
    if (t != null || g != null) return (t || 0) + (g || 0);
    return null;
  }, [b.taxableValue, b.gstAmount]);

  function resize(n) {
    n = Math.max(1, Math.min(200, Number(n) || 1));
    setQty(n);
    setUnits((prev) => Array.from({ length: n }, (_, i) => prev[i] || { roomId: '', serialNumber: '' }));
  }
  function setUnit(i, k, v) { setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, [k]: v } : u))); }
  function oneRoomEach() {
    if (!rooms.length) return;
    resize(rooms.length);
    setUnits(rooms.map((r) => ({ roomId: r.id, serialNumber: '' })));
  }
  function spreadRooms() {
    if (!rooms.length) return;
    setUnits((prev) => prev.map((u, i) => ({ ...u, roomId: rooms[i % rooms.length].id })));
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" is over 10MB`); return; }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    setUploading(true);
    try { const up = await uploadFile(dataUrl, file.name); set('photoUrl', up.url); setErr(''); }
    catch (ex) { setErr(`Upload failed: ${ex.response?.data?.error?.message || ex.message}`); }
    finally { setUploading(false); }
  }

  const baseMissing = ['categoryId', 'subCategoryId', 'description', 'siteId', 'buildingId', 'custodianId'].filter((k) => !b[k]);

  const save = useMutation({
    mutationFn: () => bulkCreateAssets({
      base: { ...b, taxableValue: b.taxableValue, gstAmount: b.gstAmount },
      units: units.map((u) => ({ roomId: u.roomId || undefined, serialNumber: u.serialNumber || undefined })),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assetRecords'] });
      setDone(res); setErr('');
    },
    onError: (e) => setErr(e.response?.data?.error?.message || 'Bulk create failed'),
  });

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-sage/40 bg-sage-tint/40 p-6 text-center">
        <div className="text-3xl">📦</div>
        <h2 className="mt-2 font-serif text-xl font-bold text-pine">{done.count} draft assets created</h2>
        <p className="mt-1 text-sm text-ink-soft">Tags {done.tags[0]} … {done.tags[done.tags.length - 1]}. Review and submit them from the Register.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => setDone(null)} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-pine">Create more</button>
          <button onClick={onDone} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">Go to Register</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">
        Create many identical assets in one go (e.g. 40 cots across a hostel). Shared details apply to every unit; give each unit its own room / serial below. Values are <span className="font-medium text-ink">per unit</span>. All units are saved as drafts.
      </p>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-serif text-lg font-semibold text-pine">Shared details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" req>
            <select value={b.categoryId || ''} onChange={(e) => setB((s) => ({ ...s, categoryId: e.target.value, subCategoryId: '' }))} className={inp}>
              <option value="">Select…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Sub-category" req>
            <select value={b.subCategoryId || ''} onChange={(e) => set('subCategoryId', e.target.value)} disabled={!cat} className={inp}>
              <option value="">Select…</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Description" req><input value={b.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 6x3 ft steel cot" className={inp} /></Field>
          <Field label="Make / Brand"><input value={b.make || ''} onChange={(e) => set('make', e.target.value)} className={inp} /></Field>
          <Field label="Model"><input value={b.model || ''} onChange={(e) => set('model', e.target.value)} className={inp} /></Field>
          <Field label="Default custodian" req>
            <select value={b.custodianId || ''} onChange={(e) => set('custodianId', e.target.value)} className={inp}>
              <option value="">Select…</option>
              {groupByDept(users.data || []).map(([dept, mem]) => (
                <optgroup key={dept} label={dept}>{mem.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
              ))}
            </select>
          </Field>
          <Field label="Site" req>
            <select value={b.siteId || ''} onChange={(e) => setB((s) => ({ ...s, siteId: e.target.value, buildingId: '' }))} className={inp}>
              <option value="">Select…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Building" req>
            <select value={b.buildingId || ''} onChange={(e) => set('buildingId', e.target.value)} disabled={!site} className={inp}>
              <option value="">Select…</option>{bldgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Date of purchase"><input type="date" value={b.dateOfPurchase || ''} onChange={(e) => set('dateOfPurchase', e.target.value)} className={inp} /></Field>
          <Field label="Taxable value / unit (₹)"><input type="number" value={b.taxableValue ?? ''} onChange={(e) => set('taxableValue', e.target.value)} className={inp} /></Field>
          <Field label="GST / unit (₹)"><input type="number" value={b.gstAmount ?? ''} onChange={(e) => set('gstAmount', e.target.value)} className={inp} /></Field>
          <Field label="Total / unit" hint="Auto"><div className={`${inp} bg-paper/60 font-medium`}>{inr(perUnit)}</div></Field>
        </div>
        <div className="mt-3">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${b.photoUrl ? 'border-sage text-sage' : 'border-line hover:border-pine'}`}>
            📷 {b.photoUrl ? 'Shared photo attached ✓' : 'Attach shared photo'}
            <input type="file" accept="image/*" onChange={onPhoto} className="hidden" />
          </label>
          {uploading && <span className="ml-2 text-xs text-ink-soft">Uploading…</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-lg font-semibold text-pine">Units</h2>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-ink-soft">Quantity</span>
            <input type="number" min={1} max={200} value={qty} onChange={(e) => resize(e.target.value)} className="w-20 rounded-lg border border-line px-2 py-1" />
          </div>
          {rooms.length > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={oneRoomEach} className="rounded-lg bg-paper px-3 py-1 text-xs text-ink-soft hover:bg-ochre-tint">One per room ({rooms.length})</button>
              <button type="button" onClick={spreadRooms} className="rounded-lg bg-paper px-3 py-1 text-xs text-ink-soft hover:bg-ochre-tint">Spread across rooms</button>
            </div>
          )}
        </div>
        {!bldg && <p className="text-sm text-ink-soft">Choose a building above to assign rooms per unit.</p>}
        <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper/90 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr><th className="px-3 py-2 w-12">#</th><th className="px-3 py-2">Room</th><th className="px-3 py-2">Serial number</th></tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-3 py-1.5 text-ink-soft">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <select value={u.roomId} onChange={(e) => setUnit(i, 'roomId', e.target.value)} disabled={!bldg} className="w-full rounded-lg border border-line px-2 py-1">
                      <option value="">No room</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5"><input value={u.serialNumber} onChange={(e) => setUnit(i, 'serialNumber', e.target.value)} className="w-full rounded-lg border border-line px-2 py-1" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {err && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{err}</p>}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-paper/80 py-3 backdrop-blur">
        {baseMissing.length > 0 && <span className="mr-auto text-xs text-ink-soft">{baseMissing.length} shared field{baseMissing.length === 1 ? '' : 's'} required</span>}
        <span className="mr-2 text-sm text-ink-soft">{qty} draft{qty === 1 ? '' : 's'}{perUnit != null ? ` · ${inr(perUnit * qty)} total` : ''}</span>
        <button onClick={() => save.mutate()} disabled={save.isPending || uploading || baseMissing.length > 0}
          className="rounded-lg bg-pine px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {save.isPending ? 'Creating…' : `Create ${qty} drafts`}
        </button>
      </div>
    </div>
  );
}
