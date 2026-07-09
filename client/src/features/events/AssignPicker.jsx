import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../api/users.api.js';

// Searchable multi-select of users (for task assignment).
export default function AssignPicker({ value = [], onChange }) {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const all = users.data || [];
  const byId = Object.fromEntries(all.map((u) => [u.id, u.name]));
  const filtered = q.trim()
    ? all.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.role.toLowerCase().includes(q.toLowerCase()))
    : all;

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink-soft">
        {value.length ? value.map((id) => byId[id]).filter(Boolean).join(', ') : 'Assign people'}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" autoFocus
            className="mb-2 w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-pine" />
          {filtered.map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-pine-tint">
              <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.name} <span className="text-xs text-ink-soft">· {u.role}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
