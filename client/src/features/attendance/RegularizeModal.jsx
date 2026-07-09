import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRegularization } from '../../api/attendance.api.js';

export default function RegularizeModal({ onClose }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => createRegularization(date, reason.trim()),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Request regularization</h3>
        <p className="mt-1 text-sm text-ink-soft">Ask your manager to correct a day's attendance.</p>

        <label className="mt-4 block text-sm">
          <span className="text-ink-soft">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-ink-soft">Reason</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Biometric didn't capture punch-out"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-pine"
          />
        </label>

        {mut.error && (
          <p className="mt-2 text-sm text-brick">
            {mut.error.response?.data?.error?.message || 'Failed to submit'}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={() => mut.mutate()}
            disabled={!date || !reason.trim() || mut.isPending}
            className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {mut.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
