import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createDirectTask } from '../../api/directTasks.api.js';
import AssignPicker from '../events/AssignPicker.jsx';

// Assign a one-off task to people without creating a whole project. If the
// assigner's task-approval mode is manual, the task stays pending their manager.
export default function AssignTaskModal({ onClose, onCreated }) {
  const qc = useQueryClient();
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [dueDate, setDueDate] = useState(todayYmd); // default: today
  const [dueTime, setDueTime] = useState('18:00');   // default: 6:00 PM

  const mut = useMutation({
    mutationFn: () => createDirectTask({ title: title.trim(), description: description.trim(), assigneeIds: assignees, dueDate: dueDate || null, dueTime: dueTime || null }),
    onSuccess: () => { qc.invalidateQueries(); onCreated?.(); onClose(); },
  });
  const canSave = title.trim() && assignees.length && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New task</h3>
        <p className="mt-0.5 text-xs text-ink-soft">A one-off task, no project needed. If your manager requires approval, it stays pending until they approve — the assignees won't see it before then.</p>

        <label className="mt-3 block text-sm"><span className="text-ink-soft">Task</span>
          <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Send the vendor list" className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
        </label>

        <label className="mt-3 block text-sm"><span className="text-ink-soft">Description <span className="text-ink-soft/70">(optional)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Any details or context…" className="mt-1 w-full resize-none rounded-lg border border-line px-3 py-2 text-sm" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-ink-soft">Due date</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="text-ink-soft">Time</span>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" /></label>
        </div>

        <div className="mt-3 text-sm"><span className="text-ink-soft">Assign to</span>
          <div className="mt-1"><AssignPicker value={assignees} onChange={setAssignees} /></div>
        </div>

        {mut.error && <p className="mt-3 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave}
            className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {mut.isPending ? 'Assigning…' : 'Assign task'}
          </button>
        </div>
      </div>
    </div>
  );
}
