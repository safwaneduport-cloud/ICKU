import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext.jsx';
import { getReports } from '../api/users.api.js';
import { getAccess as payrollAccess } from '../api/payroll.api.js';
import {
  getMyClaims, createClaim, cancelClaim, expManagerQueue, expFinanceQueue, approveClaim, rejectClaim,
} from '../api/services.api.js';
import { inr } from '../lib/format.js';

const CATEGORIES = ['Travel', 'Food', 'Fuel', 'Accommodation', 'Office purchase', 'Medical'];
const STAGES = ['manager', 'finance', 'payment', 'paid'];
const STAGE_LABEL = {
  manager: 'Awaiting manager', finance: 'Awaiting finance', payment: 'Awaiting payment',
  paid: 'Paid', rejected: 'Rejected', cancelled: 'Cancelled',
};

function Stepper({ status }) {
  const dead = status === 'rejected' || status === 'cancelled';
  const cur = STAGES.indexOf(status);
  return (
    <div className="flex gap-1" title="Employee → Manager → Finance → Payment">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-1.5 w-6 rounded-full" style={{ background: !dead && i <= cur ? '#134535' : '#DEDBD1' }} />
      ))}
    </div>
  );
}

function StagePill({ status }) {
  const m = status === 'paid' ? { c: '#2C7A57', b: '#E2EFE7' }
    : status === 'rejected' || status === 'cancelled' ? { c: '#9C3A2A', b: '#F3E1DC' }
    : { c: '#9A6312', b: '#F5EAD4' };
  return <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ color: m.c, background: m.b }}>{STAGE_LABEL[status]}</span>;
}

export default function Expenses() {
  const { user } = useAuth();
  const reports = useQuery({ queryKey: ['my-reports', user?.id], queryFn: () => getReports(user.id), enabled: !!user?.id, retry: false });
  const access = useQuery({ queryKey: ['pay-access'], queryFn: payrollAccess, retry: false });
  const hasReports = (reports.data || []).length > 0;
  const canFinance = access.data?.canPayroll;

  const [tab, setTab] = useState('my');
  const [showNew, setShowNew] = useState(false);

  const tabs = [['my', 'My Claims']];
  if (hasReports) tabs.push(['appr', 'Approvals']);
  if (canFinance) tabs.push(['fin', 'Finance']);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-3xl font-bold text-pine">Expenses</h1>
        <button onClick={() => setShowNew(true)} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New claim</button>
      </div>
      <div className="flex gap-2">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-pine text-white' : 'border border-line bg-white text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'my' && <MyClaims />}
      {tab === 'appr' && <ApprovalQueue queryKey="exp-mgr" fetcher={expManagerQueue} label="Approve" />}
      {tab === 'fin' && <ApprovalQueue queryKey="exp-fin" fetcher={expFinanceQueue} finance />}

      {showNew && <NewClaimModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function MyClaims() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['exp-mine'], queryFn: getMyClaims, retry: false });
  const cancel = useMutation({ mutationFn: cancelClaim, onSuccess: () => qc.invalidateQueries() });

  return (
    <div className="rounded-2xl border border-line bg-white">
      <p className="border-b border-line px-4 py-3 text-sm text-ink-soft">Reimbursements flow Employee → Manager → Finance → Payment.</p>
      {(q.data || []).length === 0 && <p className="px-4 py-6 text-ink-soft">No claims yet.</p>}
      {(q.data || []).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <div className="min-w-[180px] flex-1">
            <div className="font-medium">{c.category} · {inr(c.amount)}</div>
            <div className="text-xs text-ink-soft">{c.date} · {c.description}</div>
          </div>
          {c.receiptUrl && <a href={c.receiptUrl} target="_blank" rel="noreferrer"><img src={c.receiptUrl} alt="receipt" className="h-9 w-9 rounded border border-line object-cover" /></a>}
          <Stepper status={c.status} />
          <StagePill status={c.status} />
          {c.status === 'manager' && (
            <button onClick={() => cancel.mutate(c.id)} className="text-xs text-ink-soft hover:text-brick">Cancel</button>
          )}
        </div>
      ))}
    </div>
  );
}

function ApprovalQueue({ queryKey, fetcher, finance }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [queryKey], queryFn: fetcher, retry: false });
  const approve = useMutation({ mutationFn: approveClaim, onSuccess: () => qc.invalidateQueries() });
  const reject = useMutation({ mutationFn: rejectClaim, onSuccess: () => qc.invalidateQueries() });
  const rows = q.data || [];

  return (
    <div className="rounded-2xl border border-line bg-white">
      {rows.length === 0 && <p className="px-4 py-6 text-ink-soft">Nothing in this queue.</p>}
      {rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{c.user.name} · {c.category} · {inr(c.amount)}</div>
            <div className="text-xs text-ink-soft">{c.date} · {c.description}{finance ? ` · ${STAGE_LABEL[c.status]}` : ''}</div>
          </div>
          {c.receiptUrl && <a href={c.receiptUrl} target="_blank" rel="noreferrer"><img src={c.receiptUrl} alt="receipt" className="h-9 w-9 rounded border border-line object-cover" /></a>}
          <div className="flex gap-2">
            <button onClick={() => reject.mutate(c.id)} className="rounded border border-line px-2.5 py-1 text-xs hover:border-brick hover:text-brick">Reject</button>
            <button onClick={() => approve.mutate(c.id)} className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white">
              {finance && c.status === 'payment' ? 'Mark paid' : 'Approve'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewClaimModal({ onClose }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [receiptUrl, setReceiptUrl] = useState(null);

  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setReceiptUrl(r.result);
    r.readAsDataURL(f);
  };

  const mut = useMutation({
    mutationFn: () => createClaim({ category, amount: Number(amount), date, description: description.trim(), receiptUrl }),
    onSuccess: () => { qc.invalidateQueries(); onClose(); },
  });
  const valid = amount && date && description.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">New expense claim</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-sm"><span className="text-ink-soft">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Amount ₹</span>
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="0" />
          </label>
          <label className="block text-sm"><span className="text-ink-soft">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" />
          </label>
        </div>
        <label className="mt-3 block text-sm"><span className="text-ink-soft">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="What was this for?" />
        </label>
        <div className="mt-3 text-sm">
          <span className="text-ink-soft">Receipt <span className="text-xs">(image · optional)</span></span>
          <div className="mt-1 flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs hover:border-pine">
              {receiptUrl ? 'Change image' : 'Upload image'}
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
            {receiptUrl
              ? <img src={receiptUrl} alt="receipt" className="h-10 w-10 rounded border border-line object-cover" />
              : <span className="text-xs text-ink-soft">No file chosen</span>}
          </div>
        </div>
        {mut.error && <p className="mt-2 text-sm text-brick">{mut.error.response?.data?.error?.message || 'Failed'}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {mut.isPending ? 'Submitting…' : 'Submit claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
