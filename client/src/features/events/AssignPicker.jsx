import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../api/users.api.js';
import { groupByDept } from '../../lib/orgGroups.js';

// Searchable multi-select of users, grouped by department.
// The list opens INLINE (not as an overlay) so it never covers the buttons
// below it — the surrounding modal just scrolls. Keyboard: ↑/↓ to move,
// Enter to toggle the highlighted person, Esc to close.
export default function AssignPicker({ value = [], onChange, onDone }) {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const all = users.data || [];
  const byId = useMemo(() => Object.fromEntries(all.map((u) => [u.id, u.name])), [all]);
  const groups = useMemo(() => groupByDept(all, q), [all, q]);
  // Flattened, in render order — what ↑/↓ walks through.
  const flat = useMemo(() => groups.flatMap(([, members]) => members), [groups]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const toggleDept = (members) => {
    const ids = members.map((m) => m.id);
    const allIn = ids.every((id) => value.includes(id));
    onChange(allIn ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const u = flat[active];
      if (u) { toggle(u.id); setQ(''); }   // keep open for fast multi-select
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  let idx = -1; // running index across groups, matched to `flat`

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink-soft hover:border-pine">
        <span>{value.length ? `${value.length} assigned` : 'Assign people'}</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {/* selected chips — always visible, removable */}
      {value.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-pine-tint px-2 py-0.5 text-xs text-pine">
              {byId[id] || id}
              <button type="button" onClick={() => toggle(id)} className="text-pine/60 hover:text-brick" aria-label={`Remove ${byId[id]}`}>✕</button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-1 rounded-lg border border-line bg-white p-2 shadow-sm">
          {/* Search + Done sit together at the TOP so the way out is always in view */}
          <div className="flex items-center gap-2">
            <input
              value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} autoFocus
              placeholder="Search name, role or department…"
              className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-pine"
            />
            <button type="button" onClick={() => { setOpen(false); onDone?.(); }}
              className="shrink-0 rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white">
              Done{value.length ? ` (${value.length})` : ''}
            </button>
          </div>
          <p className="mt-1 px-1 text-[10px] text-ink-soft">↑↓ to move · Enter to select · Esc or Done to close</p>

          <div ref={listRef} className="mt-1 max-h-56 overflow-y-auto">
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
                  {members.map((u) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <label key={u.id} data-idx={i} onMouseEnter={() => setActive(i)}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm ${i === active ? 'bg-pine-tint' : ''}`}>
                        <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} />
                        {u.name} <span className="text-xs text-ink-soft">· {u.role}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <p className="mt-1 border-t border-line pt-1.5 text-center text-[11px] text-ink-soft">
            {value.length} selected
          </p>
        </div>
      )}
    </div>
  );
}
