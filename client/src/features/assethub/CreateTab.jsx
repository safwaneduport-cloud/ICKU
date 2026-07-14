import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssetMasters, createAssetRecord, submitAssetRecord } from '../../api/assethub.api.js';
import { getUsers } from '../../api/users.api.js';
import { uploadFile } from '../../api/files.api.js';
import { groupByDept } from '../../lib/orgGroups.js';
import { inr } from './meta.js';

const Field = ({ label, req, children, hint }) => (
  <label className="block text-sm">
    <span className="text-ink-soft">{label} {req && <span className="text-brick">*</span>}</span>
    <div className="mt-1">{children}</div>
    {hint && <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>}
  </label>
);
const inp = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine';

export default function CreateTab({ onCreated }) {
  const qc = useQueryClient();
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [f, setF] = useState({ insured: false, legacy: false });
  const [uploading, setUploading] = useState(null); // 'photo' | 'invoice'
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const m = masters.data;
  const cats = (m?.categories || []).filter((c) => c.active);
  const cat = cats.find((c) => c.id === f.categoryId);
  const subs = (cat?.subCategories || []).filter((s) => s.active);
  const sites = (m?.sites || []).filter((s) => s.active);
  const site = sites.find((s) => s.id === f.siteId);
  const bldgs = (site?.buildings || []).filter((b) => b.active);
  const bldg = bldgs.find((b) => b.id === f.buildingId);
  const rooms = (bldg?.rooms || []).filter((r) => r.active);
  const vendors = (m?.vendors || []).filter((v) => v.active);

  const total = useMemo(() => {
    const t = f.taxableValue !== undefined && f.taxableValue !== '' ? Number(f.taxableValue) : null;
    const g = f.gstAmount !== undefined && f.gstAmount !== '' ? Number(f.gstAmount) : null;
    if (t != null || g != null) return (t || 0) + (g || 0);
    return null;
  }, [f.taxableValue, f.gstAmount]);

  async function onFile(e, kind) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" is over 10MB`); return; }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    setUploading(kind);
    try {
      const up = await uploadFile(dataUrl, file.name);
      set(kind === 'photo' ? 'photoUrl' : 'invoiceUrl', up.url);
      setErr('');
    } catch (ex) {
      setErr(`Upload failed: ${ex.response?.data?.error?.message || ex.message}`);
    } finally { setUploading(null); }
  }

  const missing = ['categoryId', 'subCategoryId', 'description', 'siteId', 'buildingId', 'custodianId', 'dateOfPurchase', 'photoUrl']
    .filter((k) => !f[k]);
  if (!f.legacy && !f.invoiceUrl) missing.push('invoiceUrl');

  const save = useMutation({
    mutationFn: async ({ submit }) => {
      const created = await createAssetRecord(f);
      if (submit) await submitAssetRecord(created.id);
      return { created, submitted: submit };
    },
    onSuccess: ({ created, submitted }) => {
      qc.invalidateQueries({ queryKey: ['assetRecords'] });
      setDone({ tag: created.assetTag, submitted });
      setF({ insured: false, legacy: false });
      setErr('');
      onCreated?.();
    },
    onError: (e) => setErr(e.response?.data?.error?.message || 'Failed to create asset'),
  });

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-sage/40 bg-sage-tint/40 p-6 text-center">
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 font-serif text-xl font-bold text-pine">{done.tag}</h2>
        <p className="mt-1 text-sm text-ink-soft">{done.submitted ? 'Created and submitted for approval.' : 'Saved as a draft — submit it from the Register when ready.'}</p>
        <button onClick={() => setDone(null)} className="mt-4 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">Create another</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-serif text-lg font-semibold text-pine">Classification</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" req>
            <select value={f.categoryId || ''} onChange={(e) => setF((s) => ({ ...s, categoryId: e.target.value, subCategoryId: '' }))} className={inp}>
              <option value="">Select…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Sub-category" req>
            <select value={f.subCategoryId || ''} onChange={(e) => set('subCategoryId', e.target.value)} disabled={!cat} className={inp}>
              <option value="">Select…</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Description" req><input value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 6x3 ft steel cot" className={inp} /></Field>
          <Field label="Make / Brand"><input value={f.make || ''} onChange={(e) => set('make', e.target.value)} className={inp} /></Field>
          <Field label="Model"><input value={f.model || ''} onChange={(e) => set('model', e.target.value)} className={inp} /></Field>
          <Field label="Serial Number"><input value={f.serialNumber || ''} onChange={(e) => set('serialNumber', e.target.value)} className={inp} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-serif text-lg font-semibold text-pine">Location & Custodian</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Site" req>
            <select value={f.siteId || ''} onChange={(e) => setF((s) => ({ ...s, siteId: e.target.value, buildingId: '', roomId: '' }))} className={inp}>
              <option value="">Select…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Building" req>
            <select value={f.buildingId || ''} onChange={(e) => setF((s) => ({ ...s, buildingId: e.target.value, roomId: '' }))} disabled={!site} className={inp}>
              <option value="">Select…</option>
              {bldgs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Room" hint="Optional — assign later if needed">
            <select value={f.roomId || ''} onChange={(e) => set('roomId', e.target.value)} disabled={!bldg} className={inp}>
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
            </select>
          </Field>
          <Field label="Custodian" req hint="Accountable employee (warden for hostel assets)">
            <select value={f.custodianId || ''} onChange={(e) => set('custodianId', e.target.value)} className={inp}>
              <option value="">Select…</option>
              {groupByDept(users.data || []).map(([dept, members]) => (
                <optgroup key={dept} label={dept}>
                  {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-lg font-semibold text-pine">Purchase</h2>
          <button type="button" onClick={() => set('legacy', !f.legacy)}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${f.legacy ? 'bg-ochre text-white' : 'bg-paper text-ink-soft hover:bg-ochre-tint'}`}>
            {f.legacy ? 'Legacy asset (no invoice needed)' : 'Mark as legacy (existing asset)'}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date of Purchase" req hint={f.legacy ? 'Estimate is fine for legacy' : undefined}>
            <input type="date" value={f.dateOfPurchase || ''} onChange={(e) => set('dateOfPurchase', e.target.value)} className={inp} />
          </Field>
          <Field label="Vendor">
            <select value={f.vendorId || ''} onChange={(e) => set('vendorId', e.target.value)} className={inp}>
              <option value="">Unknown / not listed</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice Number"><input value={f.invoiceNumber || ''} onChange={(e) => set('invoiceNumber', e.target.value)} className={inp} /></Field>
          <Field label="Taxable Value (₹)"><input type="number" value={f.taxableValue ?? ''} onChange={(e) => set('taxableValue', e.target.value)} className={inp} /></Field>
          <Field label="GST Amount (₹)"><input type="number" value={f.gstAmount ?? ''} onChange={(e) => set('gstAmount', e.target.value)} className={inp} /></Field>
          <Field label="Total Value" hint="Auto: taxable + GST">
            <div className={`${inp} bg-paper/60 font-medium`}>{inr(total)}</div>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-serif text-lg font-semibold text-pine">Files</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${f.photoUrl ? 'border-sage text-sage' : 'border-line hover:border-pine'}`}>
              📷 {f.photoUrl ? 'Photo attached ✓' : 'Attach photo *'}
              <input type="file" accept="image/*" onChange={(e) => onFile(e, 'photo')} className="hidden" />
            </label>
          </div>
          <div>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${f.invoiceUrl ? 'border-sage text-sage' : 'border-line hover:border-pine'}`}>
              📄 {f.invoiceUrl ? 'Invoice attached ✓' : `Attach invoice PDF${f.legacy ? '' : ' *'}`}
              <input type="file" accept=".pdf,image/*" onChange={(e) => onFile(e, 'invoice')} className="hidden" />
            </label>
          </div>
          {uploading && <span className="self-center text-xs text-ink-soft">Uploading {uploading}…</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-serif text-lg font-semibold text-pine">Warranty & Insurance <span className="text-xs font-normal text-ink-soft">(optional)</span></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Warranty (months)"><input type="number" value={f.warrantyMonths ?? ''} onChange={(e) => set('warrantyMonths', e.target.value)} className={inp} /></Field>
          <Field label="Insured?">
            <button type="button" onClick={() => set('insured', !f.insured)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${f.insured ? 'bg-sage text-white' : 'bg-paper text-ink-soft'}`}>
              {f.insured ? 'Yes' : 'No'}
            </button>
          </Field>
          {f.insured && (
            <>
              <Field label="Policy Number"><input value={f.insurancePolicyNo || ''} onChange={(e) => set('insurancePolicyNo', e.target.value)} className={inp} /></Field>
              <Field label="Insurance Expiry"><input type="date" value={f.insuranceExpiry || ''} onChange={(e) => set('insuranceExpiry', e.target.value)} className={inp} /></Field>
            </>
          )}
        </div>
        <Field label="Remarks"><textarea rows={2} value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} className={`${inp} mt-3`} /></Field>
      </section>

      {err && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{err}</p>}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-paper/80 py-3 backdrop-blur">
        {missing.length > 0 && <span className="mr-auto text-xs text-ink-soft">{missing.length} required field{missing.length === 1 ? '' : 's'} left (photo{f.legacy ? '' : ' & invoice'} mandatory)</span>}
        <button onClick={() => save.mutate({ submit: false })} disabled={save.isPending || uploading}
          className="rounded-lg border border-line px-4 py-2.5 text-sm hover:border-pine disabled:opacity-50">Save draft</button>
        <button onClick={() => save.mutate({ submit: true })} disabled={save.isPending || uploading || missing.length > 0}
          className="rounded-lg bg-pine px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Create & submit for approval'}
        </button>
      </div>
    </div>
  );
}
