import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getUsers } from '../api/users.api.js';
import { useProfile } from '../store/ProfileContext.jsx';
import { useAuth } from '../store/AuthContext.jsx';

export default function Organization() {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const { openProfile } = useProfile();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHr = user?.id === 'ceo' || user?.id === 'EP002' || user?.role === 'HR Head';

  const [dept, setDept] = useState('all');
  const all = users.data ?? [];
  const nameById = new Map(all.map((u) => [u.id, u.name]));
  const departments = [...new Set(all.map((u) => u.department?.name).filter(Boolean))].sort();
  // Default sort is by department (then name), and an optional department filter.
  const rows = all
    .filter((u) => dept === 'all' || (u.department?.name || '—') === dept)
    .sort((a, b) => (a.department?.name || 'zzz').localeCompare(b.department?.name || 'zzz') || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Organization</h1>
        {isHr && (
          <button onClick={() => navigate('/onboard-employee')}
            className="shrink-0 whitespace-nowrap rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            + New Employee
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-ink-soft">{rows.length}{dept !== 'all' ? ` of ${all.length}` : ''} people</span>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Department
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-sm text-ink">
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      {users.isLoading && <p className="text-sm text-ink-soft">Loading…</p>}
      {users.isError && <p className="text-sm text-brick">Failed to load users.</p>}

      {/* Phone: one card per person. Five columns squeezed into 375px wraps every
          name onto three lines and hides the last two behind a scroll. */}
      {users.data && (
        <div className="divide-y divide-line/60 overflow-hidden rounded-2xl border border-line bg-white sm:hidden">
          {rows.map((u) => (
            <div key={u.id} className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 truncate text-left font-medium text-pine">
                  {u.name}
                </button>
                <span className="shrink-0 rounded bg-paper px-2 py-0.5 font-mono text-[10px]">{u.tier}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-soft">{u.role}{u.department?.name ? ` · ${u.department.name}` : ''}</p>
              {u.reportsToId && (
                <button onClick={() => openProfile(u.reportsToId)} className="mt-0.5 truncate text-xs text-ink-soft">
                  ↳ {nameById.get(u.reportsToId) ?? u.reportsToId}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {users.data && (
        <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Reports to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => openProfile(u.id)}
                      className="font-medium text-pine hover:underline"
                    >
                      {u.name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.role}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-paper px-2 py-0.5 font-mono text-xs">{u.tier}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.department?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {u.reportsToId ? (
                      <button
                        onClick={() => openProfile(u.reportsToId)}
                        className="text-ink-soft hover:text-pine hover:underline"
                      >
                        {nameById.get(u.reportsToId) ?? u.reportsToId}
                      </button>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
