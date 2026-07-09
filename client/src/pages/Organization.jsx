import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../api/users.api.js';

export default function Organization() {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl font-bold text-pine">Organization</h1>
        <span className="font-mono text-xs text-ink-soft">{users.data?.length ?? '—'} people from DB</span>
      </div>

      {users.isLoading && <p className="text-sm text-ink-soft">Loading…</p>}
      {users.isError && <p className="text-sm text-brick">Failed to load users.</p>}

      {users.data && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
              {users.data.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.role}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-paper px-2 py-0.5 font-mono text-xs">{u.tier}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.department?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{u.reportsToId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
