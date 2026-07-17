import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminAccess, getAdminUsers, createUser, updateUser, getAdminDepts, createDept, updateDept,
  getMatrix, setCapability, getSettings, toggleSetting, getAudit,
} from '../api/admin.api.js';
import { groupByDept } from '../lib/orgGroups.js';

const TIERS = ['Leadership', 'Department Head', 'Manager', 'Employee'];
const TABS = [['users', 'Users'], ['depts', 'Departments'], ['roles', 'Roles & Permissions'], ['system', 'System'], ['audit', 'Audit log']];

export default function Admin() {
  const access = useQuery({ queryKey: ['admin-access'], queryFn: adminAccess, retry: false });
  const [tab, setTab] = useState('users');

  if (access.isLoading) return <p className="text-ink-soft">Loading…</p>;
  if (!access.data?.canAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl font-bold text-pine">Admin Console</h1>
        <div className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-ink-soft">Admin access only.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-bold text-pine">Admin Console</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'depts' && <DeptsTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// ── Users ──
function UsersTab() {
  const users = useQuery({ queryKey: ['admin-users'], queryFn: getAdminUsers, retry: false });
  const depts = useQuery({ queryKey: ['admin-depts'], queryFn: getAdminDepts, retry: false });
  const [modal, setModal] = useState(null); // null | 'new' | user
  const nameOf = Object.fromEntries((users.data || []).map((u) => [u.id, u.name]));
  const deptOf = Object.fromEntries((depts.data || []).map((d) => [d.id, d.name]));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setModal('new')} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New user</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Dept</th><th className="px-4 py-3">Reports to</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {(users.data || []).map((u) => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{u.name}</td>
                <td className="px-4 py-2.5 text-ink-soft">{u.designation}</td>
                <td className="px-4 py-2.5 text-ink-soft">{deptOf[u.departmentId] || '—'}</td>
                <td className="px-4 py-2.5 text-ink-soft">{nameOf[u.reportsToId] || '—'}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-paper px-2 py-0.5 font-mono text-xs">{u.tier}</span></td>
                <td className="px-4 py-2.5"><button onClick={() => setModal(u)} className="text-xs text-pine">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <UserModal user={modal === 'new' ? null : modal} users={users.data || []} depts={depts.data || []} onClose={() => setModal(null)} />}
    </div>
  );
}

function UserModal({ user, users, depts, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', designation: user?.designation || '',
    departmentId: user?.departmentId || '', reportsToId: user?.reportsToId || '', tier: user?.tier || 'Employee', role: user?.role || '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => (user ? updateUser(user.id, f) : createUser(f)),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <Modal title={user ? 'Edit user' : 'New user'} onClose={onClose}>
      <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className="inp" /></Field>
      <Field label="Designation"><input value={f.designation} onChange={(e) => set('designation', e.target.value)} className="inp" placeholder="e.g. Faculty — Biology" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department">
          <select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} className="inp">
            <option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Tier">
          <select value={f.tier} onChange={(e) => set('tier', e.target.value)} className="inp">{TIERS.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
      </div>
      <Field label="Reports to">
        <select value={f.reportsToId} onChange={(e) => set('reportsToId', e.target.value)} className="inp">
          <option value="">— None</option>
          {groupByDept(users.filter((u) => u.id !== user?.id)).map(([dept, members]) => (
            <optgroup key={dept} label={dept}>{members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
          ))}
        </select>
      </Field>
      {mut.error && <p className="text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
      <Foot onClose={onClose} onSave={() => mut.mutate()} disabled={!f.name.trim() || mut.isPending} />
    </Modal>
  );
}

// ── Departments ──
function DeptsTab() {
  const depts = useQuery({ queryKey: ['admin-depts'], queryFn: getAdminDepts, retry: false });
  const [modal, setModal] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button onClick={() => setModal('new')} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white">+ New department</button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(depts.data || []).map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-lg" style={{ background: d.color }} />
              <div><div className="font-medium">{d.name}</div><div className="text-xs text-ink-soft">{d._count?.users ?? 0} people</div></div>
            </div>
            <button onClick={() => setModal(d)} className="text-xs text-pine">Edit</button>
          </div>
        ))}
      </div>
      {modal && <DeptModal dept={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function DeptModal({ dept, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(dept?.name || '');
  const [color, setColor] = useState(dept?.color || '#134535');
  const mut = useMutation({
    mutationFn: () => (dept ? updateDept(dept.id, { name, color }) : createDept({ name, color })),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  const swatches = ['#134535', '#2C7A57', '#3F6075', '#9A6312', '#9C3A2A'];
  return (
    <Modal title={dept ? 'Edit department' : 'New department'} onClose={onClose}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="inp" /></Field>
      <Field label="Color">
        <div className="flex gap-2">
          {swatches.map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-lg ${color === c ? 'ring-2 ring-offset-1 ring-ink' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </Field>
      {mut.error && <p className="text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
      <Foot onClose={onClose} onSave={() => mut.mutate()} disabled={!name.trim() || mut.isPending} />
    </Modal>
  );
}

// ── Roles & Permissions matrix ──
function RolesTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-matrix'], queryFn: getMatrix, retry: false });
  const toggle = useMutation({ mutationFn: ({ tier, capability, enabled }) => setCapability(tier, capability, enabled), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-matrix'] }) });
  const m = q.data;
  if (!m) return <p className="text-ink-soft">Loading…</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
          <tr><th className="px-4 py-3">Tier</th>{m.capabilities.map((c) => <th key={c.id} className="px-4 py-3 text-center">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {m.tiers.map((tier) => (
            <tr key={tier} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2.5 font-medium">{tier}</td>
              {m.capabilities.map((c) => {
                const on = m.grid[tier][c.id];
                return (
                  <td key={c.id} className="px-4 py-2.5 text-center">
                    <button onClick={() => toggle.mutate({ tier, capability: c.id, enabled: !on })}
                      className={`h-5 w-9 rounded-full transition ${on ? 'bg-pine' : 'bg-line'}`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── System settings ──
function SystemTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings, retry: false });
  const toggle = useMutation({ mutationFn: toggleSetting, onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }) });
  const rows = q.data || [];
  const groups = [['workflow', 'Approval workflows'], ['integration', 'Integrations'], ['flag', 'Feature flags']];
  return (
    <div className="space-y-5">
      {groups.map(([cat, title]) => (
        <section key={cat} className="rounded-2xl border border-line bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</div>
          <div className="mt-3 space-y-2">
            {rows.filter((r) => r.category === cat).map((r) => (
              <div key={r.key} className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0">
                <div><div className="text-sm font-medium">{r.label}</div><div className="text-xs text-ink-soft">{r.chain || r.description}</div></div>
                <button onClick={() => toggle.mutate(r.key)} className={`h-5 w-9 rounded-full transition ${r.enabled ? 'bg-sage' : 'bg-line'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition ${r.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Audit log ──
function AuditTab() {
  const q = useQuery({ queryKey: ['admin-audit'], queryFn: getAudit, retry: false });
  const rows = q.data || [];
  return (
    <div className="rounded-2xl border border-line bg-white">
      {rows.length === 0 && <p className="px-4 py-6 text-ink-soft">No admin activity yet.</p>}
      {rows.map((a) => (
        <div key={a.id} className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 text-sm last:border-0">
          <span><span className="font-medium">{a.actorId}</span> <span className="text-ink-soft">{a.action}</span></span>
          <span className="text-xs text-ink-soft">{new Date(a.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Shared modal bits ──
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md space-y-3 rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block text-sm"><span className="text-ink-soft">{label}</span><div className="mt-1">{children}</div></label>;
}
function Foot({ onClose, onSave, disabled }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
      <button onClick={onSave} disabled={disabled} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Save</button>
    </div>
  );
}
