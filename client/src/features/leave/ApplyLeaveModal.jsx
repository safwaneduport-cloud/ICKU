import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTypes, createRequest } from '../../api/leave.api.js';

export default function ApplyLeaveModal({ onClose }) {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['leave-types'], queryFn: getTypes, retry: false });

  const [typeId, setTypeId] = useState('casual');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: () => createRequest({ typeId, from, to: half ? from : to, half, reason: reason.trim() }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  const valid = typeId && from && (half || to) && reason.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Apply for leave</h3>

        <label className="mt-4 block text-sm">
          <span className="text-ink-soft">Leave type</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine"
          >
            {(types.data || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-soft">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">To</span>
            <input type="date" value={half ? from : to} disabled={half} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine disabled:bg-paper" />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
          <span>Half day (0.5)</span>
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-ink-soft">Reason</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for leave"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine" />
        </label>

        {mut.error && (
          <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed to submit'}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!valid || mut.isPending}
            className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {mut.isPending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
}
