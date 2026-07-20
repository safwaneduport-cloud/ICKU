import { useState } from 'react';
import AssignPicker from '../events/AssignPicker.jsx';

// Inline reassign editor: drop current assignees (✕) and add new ones. Each new
// recipient is re-gated by their own manager server-side, so an added person
// whose task-approval is off shows up as "pending" until their manager approves.
export default function ReassignControl({ assignees = [], onAdd, onRemove, busy }) {
  const [picked, setPicked] = useState([]);
  const existingIds = assignees.map((a) => a.id);
  const toAdd = picked.filter((id) => !existingIds.includes(id));

  return (
    <div className="mt-1.5 rounded-lg border border-line bg-paper/60 p-2">
      <div className="flex flex-wrap gap-1">
        {assignees.length === 0 && <span className="text-[11px] text-ink-soft">No one assigned.</span>}
        {assignees.map((a) => (
          <span key={a.id} className="flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[11px]">
            {a.name}
            {a.approval === 'pending' && <span className="text-ochre">· pending</span>}
            {a.status === 'rejected' && <span className="text-brick">· rejected</span>}
            <button disabled={busy} onClick={() => onRemove(a.id)} className="text-ink-soft hover:text-brick disabled:opacity-40" aria-label={`Remove ${a.name}`}>✕</button>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <AssignPicker value={picked} onChange={setPicked} />
        <button disabled={busy || !toAdd.length} onClick={() => { onAdd(toAdd); setPicked([]); }}
          className="mt-1.5 rounded-lg bg-pine px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {busy ? 'Saving…' : toAdd.length ? `Assign ${toAdd.length} more` : 'Assign'}
        </button>
      </div>
    </div>
  );
}
