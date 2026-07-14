import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../api/users.api.js';
import { groupByDept } from '../../lib/orgGroups.js';

// Searchable multi-select of users, grouped by department (helpful with a large
// org). Search filters across all departments; a per-department "all" toggles
// everyone in that group.
export default function AssignPicker({ value = [], onChange }) {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const all = users.data || [];
  const byId = Object.fromEntries(all.map((u) => [u.id, u.name]));

  const groups = useMemo(() => groupByDept(all, q), [all, q]);

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const toggleDept = (members) => {
    const ids = members.map((m) => m.id);
    const allIn = ids.every((id) => value.includes(id));
    onChange(allIn ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink-soft">
        {value.length ? `${value.length} selected: ${value.map((id) => byId[id]).filter(Boolean).slice(0, 3).join(', ')}${value.length > 3 ? '…' : ''}` : 'Assign people'}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or department…" autoFocus
            className="sticky top-0 mb-2 w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-pine" />
          {groups.length === 0 && <p className="px-2 py-2 text-xs text-ink-soft">No matches.</p>}
          {groups.map(([dept, members]) => {
            const allIn = members.every((m) => value.includes(m.id));
            return (
              <div key={dept} className="mb-1">
                <div className="flex items-center justify-between rounded bg-paper px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{dept} · {members.length}</span>
                  <button type="button" onClick={() => toggleDept(members)} className="text-[11px] font-medium text-pine hover:underline">
                    {allIn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                {members.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-pine-tint">
                    <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} />
                    {u.name} <span className="text-xs text-ink-soft">· {u.role}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
