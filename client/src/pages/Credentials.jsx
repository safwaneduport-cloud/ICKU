import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getCredentials, resetCredential, updateCredentialUsername } from '../api/credentials.api.js';

const passwordOf = (r) => (r.passwordChanged ? '(changed by user)' : r.tempPassword || '—');

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Employee Number', 'Name', 'Email', 'Department', 'Designation', 'Username', 'Password'];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.employeeNumber, r.name, r.email, r.department, r.designation, r.username, passwordOf(r)].map(esc).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `icku-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(rows) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const body = rows
    .map((r) => `<tr><td>${esc(r.employeeNumber)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.username)}</td><td>${esc(passwordOf(r))}</td></tr>`)
    .join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>ICKU Credentials</title><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1B2520}
    h1{font-size:18px;margin:0 0 2px} p{font-size:12px;color:#5E635B;margin:0 0 14px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #DEDBD1;padding:4px 7px;text-align:left}
    th{background:#134535;color:#fff}
  </style></head><body>
    <h1>ICKU — Employee Login Credentials</h1>
    <p>${rows.length} employees · Generated ${new Date().toLocaleString()} · Temporary password shown until the employee changes it</p>
    <table><thead><tr><th>Emp No</th><th>Name</th><th>Department</th><th>Username</th><th>Password</th></tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  w.document.close();
}

export default function Credentials() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isHr = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const creds = useQuery({ queryKey: ['credentials'], queryFn: getCredentials, retry: false, enabled: isHr });
  const reset = useMutation({ mutationFn: (userId) => resetCredential(userId), onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }) });
  const rename = useMutation({ mutationFn: () => updateCredentialUsername(editId, editName.trim()), onSuccess: () => { setEditId(null); qc.invalidateQueries({ queryKey: ['credentials'] }); } });

  const rows = useMemo(() => {
    const all = creds.data || [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) => [r.name, r.username, r.employeeNumber, r.department, r.email].some((v) => (v || '').toLowerCase().includes(s)));
  }, [creds.data, q]);

  if (!isHr) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Credentials</h1>
        <p className="text-sm text-ink-soft">Login credentials are available to HR and Admin only.</p>
      </div>
    );
  }

  const stats = creds.data ? { total: creds.data.length, changed: creds.data.filter((r) => r.passwordChanged).length } : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-3xl font-bold text-pine">Login Credentials</h1>
          <p className="text-sm text-ink-soft">
            Every employee's username and temporary password.
            {stats && <> {stats.total} accounts · {stats.changed} have set their own password.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCsv(rows)} className="rounded-lg border border-line px-3 py-2 text-sm hover:border-pine">Export CSV</button>
          <button onClick={() => exportPdf(rows)} className="rounded-lg border border-line px-3 py-2 text-sm hover:border-pine">Export PDF</button>
        </div>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, employee no, department…"
        className="w-full max-w-md rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-pine" />

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-line bg-white text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5">Emp No</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Username</th>
                <th className="px-4 py-2.5">Password</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {creds.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-ink-soft">Loading 670 accounts…</td></tr>}
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{r.employeeNumber}</td>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-ink-soft">{r.department}</td>
                  <td className="px-4 py-2">
                    {editId === r.userId ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') rename.mutate(); if (e.key === 'Escape') setEditId(null); }}
                        className="w-40 rounded border border-line px-2 py-1 text-sm outline-none focus:border-pine" />
                    ) : (
                      <span className="font-mono text-xs">{r.username}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.passwordChanged
                      ? <span className="rounded bg-paper px-2 py-0.5 text-xs text-ink-soft">changed by user</span>
                      : <span className="font-mono text-xs">{r.tempPassword}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2 text-xs">
                      {editId === r.userId ? (
                        <>
                          <button onClick={() => rename.mutate()} className="font-medium text-pine">Save</button>
                          <button onClick={() => setEditId(null)} className="text-ink-soft">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(r.userId); setEditName(r.username); }} className="text-steel hover:underline">Edit</button>
                          <button onClick={() => { if (confirm(`Reset ${r.name}'s password to the temp password?`)) reset.mutate(r.userId); }} className="text-ochre hover:underline">Reset</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !creds.isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">No matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
