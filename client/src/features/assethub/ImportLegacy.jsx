import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAssetMasters, importLegacyAssets } from '../../api/assethub.api.js';

const COLS = ['subCategory', 'description', 'make', 'model', 'serialNumber', 'room', 'custodian', 'dateOfPurchase', 'deemedCost'];
const inp = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine';

// Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas/quotes).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export default function ImportLegacy() {
  const qc = useQueryClient();
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
  const [f, setF] = useState({});
  const [rows, setRows] = useState(null);   // [{subCategory,...}]
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [rowErrors, setRowErrors] = useState({}); // { rowNumber: [msg] }
  const [done, setDone] = useState(null);

  const m = masters.data;
  const cats = (m?.categories || []).filter((c) => c.active);
  const cat = cats.find((c) => c.id === f.categoryId);
  const sites = (m?.sites || []).filter((s) => s.active);
  const site = sites.find((s) => s.id === f.siteId);
  const bldgs = (site?.buildings || []).filter((x) => x.active);

  function downloadTemplate() {
    const example = ['STEEL COT', '6x3 ft steel cot', 'Godrej', 'GX-1', 'SN-0001', '101', 'EP023', '2020-06-01', '2500'];
    const csv = [COLS.join(','), example.join(','), COLS.map(() => '').join(',')].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'assethub-legacy-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setFileName(file.name); setErr(''); setRowErrors({}); setDone(null);
    const text = await file.text();
    const grid = parseCSV(text);
    if (grid.length < 2) { setErr('The file has a header but no data rows.'); setRows(null); return; }
    const header = grid[0].map((h) => h.trim());
    const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const map = Object.fromEntries(COLS.map((c) => [c, idx(c)]));
    if (map.subCategory < 0 || map.description < 0 || map.custodian < 0) {
      setErr('CSV must have at least subCategory, description and custodian columns. Download the template for the exact headers.');
      setRows(null); return;
    }
    const parsed = grid.slice(1).map((r) => Object.fromEntries(COLS.map((c) => [c, map[c] >= 0 ? (r[map[c]] || '').trim() : ''])));
    setRows(parsed);
  }

  const importIt = useMutation({
    mutationFn: () => importLegacyAssets({ siteId: f.siteId, buildingId: f.buildingId, categoryId: f.categoryId, rows }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['assetRecords'] }); setDone(res); setRowErrors({}); setErr(''); },
    onError: (e) => {
      const details = e.response?.data?.error?.details;
      if (Array.isArray(details)) {
        const byRow = {};
        details.forEach((d) => { (byRow[d.row] ||= []).push(d.message); });
        setRowErrors(byRow);
        setErr(`${details.length} problem(s) found — fix the highlighted rows and re-import.`);
      } else setErr(e.response?.data?.error?.message || 'Import failed');
    },
  });

  const ready = f.siteId && f.buildingId && f.categoryId && rows?.length;

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-sage/40 bg-sage-tint/40 p-6 text-center">
        <div className="text-3xl">🗂️</div>
        <h2 className="mt-2 font-serif text-xl font-bold text-pine">{done.count} legacy assets imported</h2>
        <p className="mt-1 text-sm text-ink-soft">Saved as Legacy drafts on deemed cost. Review and submit them from the Register.</p>
        <button onClick={() => { setDone(null); setRows(null); setFileName(''); }} className="mt-4 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">Import another file</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-soft">
        Migrate existing assets from a spreadsheet — one building at a time. Assets are flagged <span className="font-medium text-ochre">Legacy</span> and valued at <span className="font-medium text-ink">deemed cost</span>. Custodian is the employee number (e.g. EP023); room is the room number within the chosen building.
      </p>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm"><span className="text-ink-soft">Site <span className="text-brick">*</span></span>
            <select value={f.siteId || ''} onChange={(e) => setF((s) => ({ ...s, siteId: e.target.value, buildingId: '' }))} className={`${inp} mt-1`}>
              <option value="">Select…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Building <span className="text-brick">*</span></span>
            <select value={f.buildingId || ''} onChange={(e) => setF((s) => ({ ...s, buildingId: e.target.value }))} disabled={!site} className={`${inp} mt-1`}>
              <option value="">Select…</option>{bldgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Category <span className="text-brick">*</span></span>
            <select value={f.categoryId || ''} onChange={(e) => setF((s) => ({ ...s, categoryId: e.target.value }))} className={`${inp} mt-1`}>
              <option value="">Select…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {cat && (
          <p className="mt-2 text-xs text-ink-soft">Sub-category values must match one of: {(cat.subCategories || []).filter((s) => s.active).map((s) => `${s.code} / ${s.name}`).join(' · ')}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={downloadTemplate} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-pine">⬇ Download CSV template</button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">
            ⬆ Upload CSV<input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {fileName && <span className="text-sm text-ink-soft">{fileName} · {rows?.length || 0} rows</span>}
        </div>
      </section>

      {err && <p className="rounded-lg bg-brick/5 px-4 py-2 text-sm text-brick">{err}</p>}

      {rows?.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-paper/90 text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr><th className="px-3 py-2">#</th>{COLS.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const errs = rowErrors[i + 1];
                  return (
                    <tr key={i} className={`border-t border-line/60 ${errs ? 'bg-brick/5' : ''}`}>
                      <td className="px-3 py-1.5 text-ink-soft">{i + 1}{errs && <span title={errs.join('; ')} className="ml-1 text-brick">⚠</span>}</td>
                      {COLS.map((c) => <td key={c} className="px-3 py-1.5 text-ink">{r[c] || <span className="text-ink-soft">—</span>}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Object.keys(rowErrors).length > 0 && (
            <div className="border-t border-line bg-brick/5 px-4 py-2 text-xs text-brick">
              {Object.entries(rowErrors).map(([row, msgs]) => <div key={row}>Row {row}: {msgs.join('; ')}</div>)}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <button onClick={() => importIt.mutate()} disabled={!ready || importIt.isPending}
              className="rounded-lg bg-pine px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              {importIt.isPending ? 'Importing…' : `Import ${rows.length} legacy assets`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
