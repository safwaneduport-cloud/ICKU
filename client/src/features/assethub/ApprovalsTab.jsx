import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApprovalQueue } from '../../api/assethub.api.js';
import { STATUS, EVENT_TYPES, inr } from './meta.js';
import AssetDetail from './AssetDetail.jsx';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');

function EventCard({ e, onOpen }) {
  const t = EVENT_TYPES[e.type] || {};
  return (
    <button onClick={onOpen} className="w-full rounded-xl border border-line bg-white p-3 text-left hover:border-pine">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span>{t.icon}</span>
            <span className="text-sm font-semibold text-ink">{t.label}</span>
            <span className="font-mono text-xs font-medium text-pine">{e.asset?.assetTag}</span>
          </div>
          <p className="mt-0.5 text-sm text-ink">{e.reason}</p>
          <p className="text-xs text-ink-soft">{e.asset?.description} · raised by {e.requestedBy?.name}{e.amount != null ? ` · ${inr(e.amount)}` : ''}</p>
        </div>
        <div className="text-right text-xs text-ink-soft">{fmt(e.createdAt)}</div>
      </div>
    </button>
  );
}

function Card({ a, escalated, onOpen }) {
  const st = STATUS[a.status] || {};
  return (
    <button onClick={onOpen} className="w-full rounded-xl border border-line bg-white p-3 text-left hover:border-pine">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-pine">{a.assetTag}</span>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: st.c, background: st.b }}>{st.label}</span>
            {escalated && <span className="rounded-full bg-brick/10 px-2 py-0.5 text-xs font-medium text-brick">48h overdue</span>}
          </div>
          <p className="mt-0.5 text-sm text-ink">{a.description}</p>
          <p className="text-xs text-ink-soft">{a.site?.code} · {a.building?.code} · custodian {a.custodian?.name} · raised by {a.createdBy?.name}</p>
        </div>
        <div className="text-right">
          <div className="font-medium text-ink">{inr(a.totalValue)}</div>
          <div className="text-xs text-ink-soft">{fmt(a.submittedAt || a.ackRequestedAt)}</div>
        </div>
      </div>
    </button>
  );
}

export default function ApprovalsTab() {
  const q = useQuery({ queryKey: ['approvalQueue'], queryFn: getApprovalQueue, retry: false });
  const [open, setOpen] = useState(null); // { id, mode }
  const toApprove = q.data?.toApprove || [];
  const toAck = q.data?.toAcknowledge || [];
  const toEvents = q.data?.toApproveEvents || [];

  if (q.isLoading) return <div className="py-10 text-center text-sm text-ink-soft">Loading queue…</div>;
  if (!toApprove.length && !toAck.length && !toEvents.length) {
    return (
      <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="mt-2 font-serif text-xl font-semibold text-pine">Your queue is clear</h2>
        <p className="mt-1 text-sm text-ink-soft">Nothing is waiting on your approval or acknowledgement right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toApprove.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-pine">Awaiting your approval ({toApprove.length})</h2>
          <div className="grid gap-2">
            {toApprove.map((a) => <Card key={a.id} a={a} onOpen={() => setOpen({ id: a.id, mode: 'approve' })} />)}
          </div>
        </section>
      )}
      {toEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-pine">Lifecycle requests ({toEvents.length})</h2>
          <div className="grid gap-2">
            {toEvents.map((e) => <EventCard key={e.id} e={e} onOpen={() => setOpen({ id: e.asset.id, mode: 'event' })} />)}
          </div>
        </section>
      )}

      {toAck.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-pine">Awaiting acknowledgement ({toAck.length})</h2>
          <div className="grid gap-2">
            {toAck.map((a) => <Card key={a.id} a={a} escalated={a.escalated} onOpen={() => setOpen({ id: a.id, mode: 'ack' })} />)}
          </div>
        </section>
      )}

      {open && <AssetDetail assetId={open.id} queueMode={open.mode} onClose={() => setOpen(null)} />}
    </div>
  );
}
