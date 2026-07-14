import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReportKpis, getReportTypes, runReport, getAuditTrail } from '../../api/assethub.api.js';
import { ACTION_LABEL, inr } from './meta.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const isDateCol = (c) => c.key === 'date' || c.key === 'at';

function cellText(c, v) {
  if (v == null || v === '') return '';
  if (c.money) return Number(v).toLocaleString('en-IN');
  if (isDateCol(c)) return fmtDate(v);
  return String(v);
}
function cellDisplay(c, v) {
  if (v == null || v === '') return <span className="text-ink-soft">—</span>;
  if (c.money) return inr(v);
  if (isDateCol(c)) return fmtDate(v);
  return String(v);
}

function downloadCSV(title, columns, rows, totals) {
  const esc = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => esc(cellText(c, r[c.key]))).join(',')));
  if (totals) lines.push(columns.map((c, i) => esc(i === 0 ? 'TOTAL' : totals[c.key] != null ? cellText(c, totals[c.key]) : '')).join(','));
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function printPDF(title, columns, rows, totals) {
  const th = columns.map((c) => `<th style="text-align:${c.align || 'left'}">${c.label}</th>`).join('');
  const tr = rows.map((r) => `<tr>${columns.map((c) => `<td style="text-align:${c.align || 'left'}">${cellText(c, r[c.key])}</td>`).join('')}</tr>`).join('');
  const tot = totals ? `<tr class="tot">${columns.map((c, i) => `<td style="text-align:${c.align || 'left'}">${i === 0 ? 'TOTAL' : (totals[c.key] != null ? cellText(c, totals[c.key]) : '')}</td>`).join('')}</tr>` : '';
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;color:#1f2420}
    h1{font-size:18px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border-bottom:1px solid #ddd;padding:6px 8px}
    th{background:#f3f1ea;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
    tr.tot td{font-weight:700;border-top:2px solid #333}
  </style></head><body><h1>AssetHub — ${title}</h1>
  <div class="meta">${rows.length} rows · generated ${new Date().toLocaleString('en-IN')}</div>
  <table><thead><tr>${th}</tr></thead><tbody>${tr}${tot}</tbody></table>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

export default function ReportsTab() {
  const [sel, setSel] = useState('register'); // report type or 'audit'
  const kpis = useQuery({ queryKey: ['assetKpis'], queryFn: getReportKpis, retry: false });
  const types = useQuery({ queryKey: ['assetReportTypes'], queryFn: getReportTypes, retry: false });
  const k = kpis.data;

  if (kpis.isError) {
    return <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center text-sm text-ink-soft">{kpis.error?.response?.data?.error?.message || 'You don’t have access to AssetHub reports.'}</div>;
  }

  const KPI = ({ label, value, tone }) => (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className={`font-serif text-2xl font-bold ${tone || 'text-pine'}`}>{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KPI label="Total assets" value={k ? k.totalAssets : '—'} />
        <KPI label="Book value" value={k ? inr(k.bookValue) : '—'} />
        <KPI label="Pending" value={k ? k.pending : '—'} tone="text-ochre" />
        <KPI label="Under repair" value={k ? k.underRepair : '—'} tone="text-ochre" />
        <KPI label="Disposed" value={k ? k.disposed : '—'} tone="text-ink" />
        <KPI label="Written off" value={k ? k.writtenOff : '—'} tone="text-brick" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(types.data || []).map(([id, label]) => (
          <button key={id} onClick={() => setSel(id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${sel === id ? 'bg-pine text-white' : 'bg-white text-ink-soft hover:text-pine'} border border-line`}>{label}</button>
        ))}
        <button onClick={() => setSel('audit')}
          className={`rounded-lg px-3 py-1.5 text-sm ${sel === 'audit' ? 'bg-pine text-white' : 'bg-white text-ink-soft hover:text-pine'} border border-line`}>Audit trail</button>
      </div>

      {sel === 'audit' ? <AuditView /> : <ReportView type={sel} />}
    </div>
  );
}

function ReportView({ type }) {
  const q = useQuery({ queryKey: ['assetReport', type], queryFn: () => runReport(type), retry: false });
  const r = q.data;
  if (q.isLoading || !r) return <div className="py-10 text-center text-sm text-ink-soft">Loading…</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div><span className="font-serif text-lg font-semibold text-pine">{r.title}</span><span className="ml-2 text-xs text-ink-soft">{r.rows.length} rows</span></div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV(r.title, r.columns, r.rows, r.totals)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-pine">⬇ CSV</button>
          <button onClick={() => printPDF(r.title, r.columns, r.rows, r.totals)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-pine">🖨 PDF</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr>{r.columns.map((c) => <th key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {r.rows.length === 0 && <tr><td colSpan={r.columns.length} className="px-4 py-10 text-center text-ink-soft">Nothing to report.</td></tr>}
            {r.rows.map((row, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                {r.columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : ''} ${c.key === 'assetTag' ? 'font-mono text-xs font-medium text-pine' : 'text-ink'}`}>{cellDisplay(c, row[c.key])}</td>
                ))}
              </tr>
            ))}
            {r.totals && r.rows.length > 0 && (
              <tr className="border-t-2 border-line bg-paper/40 font-medium">
                {r.columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{i === 0 ? 'Total' : r.totals[c.key] != null ? cellDisplay(c, r.totals[c.key]) : ''}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditView() {
  const q = useQuery({ queryKey: ['assetAudit'], queryFn: () => getAuditTrail({ limit: 300 }), retry: false });
  const rows = q.data || [];
  if (q.isLoading) return <div className="py-10 text-center text-sm text-ink-soft">Loading…</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3"><span className="font-serif text-lg font-semibold text-pine">Audit trail</span><span className="ml-2 text-xs text-ink-soft">field-level change log · {rows.length} events</span></div>
      <ul className="divide-y divide-line/60">
        {rows.map((h) => (
          <li key={h.id} className="flex gap-3 px-4 py-2.5 text-sm">
            <span className="w-32 shrink-0 text-xs text-ink-soft">{fmtDT(h.at)}</span>
            <span className="w-28 shrink-0 font-mono text-xs font-medium text-pine">{h.assetTag}</span>
            <div className="min-w-0 flex-1">
              <span className="font-medium text-ink">{ACTION_LABEL[h.action] || h.action}</span>
              <span className="text-ink-soft"> · {h.by}</span>
              {h.note && <p className="text-ink-soft">{h.note}</p>}
              {h.meta && <MetaChanges meta={h.meta} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Renders finance-edit field changes { field: [old, new] } and other meta compactly.
function MetaChanges({ meta }) {
  const entries = Object.entries(meta).filter(([, v]) => Array.isArray(v) && v.length === 2);
  if (!entries.length) {
    const scalars = Object.entries(meta).filter(([, v]) => !Array.isArray(v) && v != null);
    if (!scalars.length) return null;
    return <p className="mt-0.5 text-xs text-ink-soft">{scalars.map(([kk, v]) => `${kk}: ${v}`).join(' · ')}</p>;
  }
  const short = (v) => (v == null || v === '' ? '∅' : String(v).length > 18 ? String(v).slice(0, 16) + '…' : String(v));
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([field, [oldV, newV]]) => (
        <span key={field} className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
          <span className="font-medium text-ink">{field}</span>: {short(oldV)} → <span className="text-pine">{short(newV)}</span>
        </span>
      ))}
    </div>
  );
}
