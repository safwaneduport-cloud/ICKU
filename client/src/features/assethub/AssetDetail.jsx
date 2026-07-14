import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssetRecord, getAssetMasters, getAssetAccess, submitAssetRecord, approveAssetRecord,
  sendBackAssetRecord, acknowledgeAssetRecord, voidAssetRecord, updateAssetRecord,
  raiseAssetEvent, approveAssetEvent, rejectAssetEvent, repairAssetRecord,
} from '../../api/assethub.api.js';
import { getUsers } from '../../api/users.api.js';
import { useAuth } from '../../store/AuthContext.jsx';
import { groupByDept } from '../../lib/orgGroups.js';
import { STATUS, ROLE_LABEL, ACTION_LABEL, EVENT_TYPES, inr } from './meta.js';

const FINANCE_ROLES = ['FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO'];
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-ink-soft">{k}</span>
    <span className="text-right font-medium text-ink">{v ?? '—'}</span>
  </div>
);

export default function AssetDetail({ assetId, queueMode, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const access = useQuery({ queryKey: ['assetAccess'], queryFn: getAssetAccess, retry: false });
  const q = useQuery({ queryKey: ['assetRecord', assetId], queryFn: () => getAssetRecord(assetId), enabled: !!assetId, retry: false });
  const masters = useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false, enabled: !!assetId });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false, enabled: !!assetId });
  const [err, setErr] = useState('');
  const [fin, setFin] = useState(null); // finance-review draft { glCodeId, itcEligible, datePutToUse, reason }
  const [evForm, setEvForm] = useState(null); // lifecycle event form { type, ...fields }

  const a = q.data;
  const me = user?.id;
  const roles = access.data?.roles || [];
  const isAdmin = access.data?.isAssetAdmin;
  const hasFinance = roles.some((r) => FINANCE_ROLES.includes(r.role));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assetRecord', assetId] });
    qc.invalidateQueries({ queryKey: ['assetRecords'] });
    qc.invalidateQueries({ queryKey: ['approvalQueue'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const act = (fn, after) => useMutation({
    mutationFn: fn,
    onSuccess: () => { invalidate(); setErr(''); after?.(); },
    onError: (e) => setErr(e.response?.data?.error?.message || 'Action failed'),
  });

  const submit = act((id) => submitAssetRecord(id));
  const approve = act(({ id, note }) => approveAssetRecord(id, note));
  const sendback = act(({ id, reason }) => sendBackAssetRecord(id, reason), onClose);
  const ack = act((id) => acknowledgeAssetRecord(id));
  const voidIt = act(({ id, reason }) => voidAssetRecord(id, reason), onClose);
  const saveFin = act(({ id, patch }) => updateAssetRecord(id, patch), () => setFin(null));
  const raiseEv = act(({ id, payload }) => raiseAssetEvent(id, payload), () => setEvForm(null));
  const approveEv = act(({ eventId, note }) => approveAssetEvent(eventId, note), onClose);
  const rejectEv = act(({ eventId, reason }) => rejectAssetEvent(eventId, reason), onClose);
  const repair = act((id) => repairAssetRecord(id));

  if (!assetId) return null;

  const st = a && STATUS[a.status];
  const isFinanceStage = a && ['pending_finance_review', 'pending_finance_approval'].includes(a.status);
  const canSubmit = a && a.status === 'draft' && (a.createdBy?.id === me || isAdmin);
  const canVoid = a && !['void', 'disposed', 'written_off'].includes(a.status) && (isAdmin || hasFinance);
  const canAck = a && a.status === 'pending_ack' && (a.custodian?.id === me || queueMode === 'ack');
  const canApprove = queueMode === 'approve' && a && ['pending_branch', 'pending_finance_review', 'pending_finance_approval'].includes(a.status);
  const financeGate = isFinanceStage && (!a.glCodeId || a.itcEligible == null || !a.datePutToUse);
  const glCodes = (masters.data?.glCodes || []).filter((g) => g.active);

  // ── lifecycle ──
  const pendingEvent = a?.events?.find((e) => e.status === 'pending');
  const canRaise = a && ['active', 'under_repair'].includes(a.status) && !pendingEvent
    && (isAdmin || roles.length > 0 || a.custodian?.id === me);
  const availableEvents = a && (a.status === 'under_repair'
    ? ['disposal', 'write_off']
    : a.status === 'active' ? ['transfer', 'capex', 'damage', 'disposal', 'write_off'] : []);
  const canRepair = a && a.status === 'under_repair' && (isAdmin || roles.length > 0);
  const canActOnEvent = queueMode === 'event' && pendingEvent;
  const sites = (masters.data?.sites || []).filter((s) => s.active);
  const evSite = sites.find((s) => s.id === evForm?.toSiteId);
  const evBldgs = (evSite?.buildings || []).filter((x) => x.active);
  const evBldg = evBldgs.find((x) => x.id === evForm?.toBuildingId);
  const evRooms = (evBldg?.rooms || []).filter((r) => r.active);

  const submitEvent = () => {
    const p = { type: evForm.type, reason: evForm.reason };
    if (evForm.type === 'transfer') Object.assign(p, { toBuildingId: evForm.toBuildingId, toRoomId: evForm.toRoomId || undefined, toCustodianId: evForm.toCustodianId });
    if (['capex', 'disposal', 'write_off'].includes(evForm.type)) p.amount = evForm.amount;
    raiseEv.mutate({ id: a.id, payload: p });
  };
  const evValid = evForm && evForm.reason?.trim()
    && (evForm.type !== 'transfer' || (evForm.toBuildingId && evForm.toCustodianId))
    && (evForm.type !== 'capex' || Number(evForm.amount) > 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-paper shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {q.isLoading || !a ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-soft">Loading…</div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-mono text-lg font-bold text-pine">{a.assetTag}</h2>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: st.c, background: st.b }}>{st.label}</span>
                  {a.legacy && <span className="rounded-full bg-ochre-tint px-2 py-0.5 text-xs text-ochre">Legacy</span>}
                </div>
                <p className="mt-0.5 text-sm text-ink">{a.description}</p>
                <p className="text-xs text-ink-soft">{a.category?.name} · {a.subCategory?.name}</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-soft hover:bg-paper">✕</button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* approval chain progress */}
              {a.approvalChain?.length > 0 && (
                <div className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Approval chain</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {a.approvalChain.map((role, i) => {
                      const passed = a.status === 'active' || a.status === 'pending_ack' || i < a.chainIndex;
                      const current = i === a.chainIndex && a.status?.startsWith('pending_');
                      return (
                        <span key={i} className={`rounded-full px-2 py-1 ${passed ? 'bg-sage-tint text-sage' : current ? 'bg-ochre-tint font-medium text-ochre' : 'bg-paper text-ink-soft'}`}>
                          {passed ? '✓ ' : ''}{ROLE_LABEL[role] || role}
                        </span>
                      );
                    })}
                    <span className={`rounded-full px-2 py-1 ${a.status === 'active' ? 'bg-sage-tint text-sage' : 'bg-paper text-ink-soft'}`}>
                      {a.status === 'active' ? '✓ ' : ''}Custodian ack
                    </span>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <section className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Location & custodian</p>
                  <Row k="Site" v={a.site?.name} />
                  <Row k="Building" v={a.building?.name} />
                  <Row k="Room" v={a.room?.number} />
                  <Row k="Custodian" v={a.custodian?.name} />
                </section>
                <section className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Identification</p>
                  <Row k="Make" v={a.make} />
                  <Row k="Model" v={a.model} />
                  <Row k="Serial no." v={a.serialNumber} />
                  <Row k="Quantity" v={a.quantity} />
                </section>
                <section className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Purchase</p>
                  <Row k="Date" v={fmt(a.dateOfPurchase)} />
                  <Row k="Vendor" v={a.vendor?.name} />
                  <Row k="Invoice no." v={a.invoiceNumber} />
                  <Row k="Taxable" v={inr(a.taxableValue)} />
                  <Row k="GST" v={inr(a.gstAmount)} />
                  <Row k="Total" v={<span className="text-pine">{inr(a.totalValue)}</span>} />
                </section>
                <section className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Finance</p>
                  <Row k="GL code" v={a.glCode ? `${a.glCode.code}` : '—'} />
                  <Row k="ITC eligible" v={a.itcEligible == null ? '—' : a.itcEligible ? 'Yes' : 'No'} />
                  <Row k="Put to use" v={fmt(a.datePutToUse)} />
                  <Row k="Warranty" v={a.warrantyMonths ? `${a.warrantyMonths} mo` : '—'} />
                  <Row k="Insured" v={a.insured ? (a.insurancePolicyNo || 'Yes') : 'No'} />
                </section>
              </div>

              {(a.photoUrl || a.invoiceUrl) && (
                <div className="flex gap-2">
                  {a.photoUrl && <a href={a.photoUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-pine">📷 View photo</a>}
                  {a.invoiceUrl && <a href={a.invoiceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-pine">📄 View invoice</a>}
                </div>
              )}

              {a.remarks && <p className="rounded-xl border border-line bg-white p-3 text-sm text-ink-soft"><span className="font-medium text-ink">Remarks: </span>{a.remarks}</p>}

              {/* pending lifecycle request */}
              {pendingEvent && (
                <div className="rounded-xl border border-ochre/40 bg-ochre-tint/30 p-3">
                  <div className="flex items-center gap-2">
                    <span>{EVENT_TYPES[pendingEvent.type]?.icon}</span>
                    <span className="text-sm font-semibold text-ochre">{EVENT_TYPES[pendingEvent.type]?.label} requested</span>
                    <span className="text-xs text-ink-soft">by {pendingEvent.requestedBy?.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{pendingEvent.reason}</p>
                  {pendingEvent.type === 'transfer' && (
                    <p className="mt-1 text-xs text-ink-soft">→ {pendingEvent.toBuildingName}{pendingEvent.toRoomNumber ? ` · Room ${pendingEvent.toRoomNumber}` : ''} · custodian {pendingEvent.toCustodianName}</p>
                  )}
                  {pendingEvent.amount != null && <p className="mt-1 text-xs text-ink-soft">Amount: {inr(pendingEvent.amount)}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {pendingEvent.approvalChain.map((role, i) => (
                      <span key={i} className={`rounded-full px-2 py-1 ${i < pendingEvent.chainIndex ? 'bg-sage-tint text-sage' : i === pendingEvent.chainIndex ? 'bg-ochre-tint font-medium text-ochre' : 'bg-white text-ink-soft'}`}>
                        {i < pendingEvent.chainIndex ? '✓ ' : ''}{ROLE_LABEL[role] || role}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* raise a lifecycle event */}
              {canRaise && !evForm && (
                <div className="rounded-xl border border-line bg-white p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Lifecycle</p>
                  <div className="flex flex-wrap gap-2">
                    {availableEvents.map((t) => (
                      <button key={t} onClick={() => setEvForm({ type: t })}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-pine">
                        {EVENT_TYPES[t].icon} {EVENT_TYPES[t].label}
                      </button>
                    ))}
                    {canRepair && (
                      <button onClick={() => repair.mutate(a.id)} disabled={repair.isPending}
                        className="rounded-lg border border-sage/50 px-3 py-1.5 text-sm text-sage hover:bg-sage-tint/40">✅ Mark repaired</button>
                    )}
                  </div>
                </div>
              )}

              {/* lifecycle event form */}
              {evForm && (
                <div className="rounded-xl border border-pine/30 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-pine">{EVENT_TYPES[evForm.type].icon} {EVENT_TYPES[evForm.type].label}</span>
                    <button onClick={() => setEvForm(null)} className="text-xs text-ink-soft hover:text-ink">Cancel</button>
                  </div>
                  <p className="mb-2 text-xs text-ink-soft">Approval: {EVENT_TYPES[evForm.type].chain}</p>
                  {evForm.type === 'transfer' && (
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      <select value={evForm.toSiteId || ''} onChange={(e) => setEvForm((s) => ({ ...s, toSiteId: e.target.value, toBuildingId: '', toRoomId: '' }))} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                        <option value="">Destination site…</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select value={evForm.toBuildingId || ''} onChange={(e) => setEvForm((s) => ({ ...s, toBuildingId: e.target.value, toRoomId: '' }))} disabled={!evSite} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                        <option value="">Building…</option>{evBldgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <select value={evForm.toRoomId || ''} onChange={(e) => setEvForm((s) => ({ ...s, toRoomId: e.target.value }))} disabled={!evBldg} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                        <option value="">No room</option>{evRooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
                      </select>
                      <select value={evForm.toCustodianId || ''} onChange={(e) => setEvForm((s) => ({ ...s, toCustodianId: e.target.value }))} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                        <option value="">New custodian…</option>
                        {groupByDept(usersQ.data || []).map(([dept, mem]) => (
                          <optgroup key={dept} label={dept}>{mem.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                  {['capex', 'disposal', 'write_off'].includes(evForm.type) && (
                    <input type="number" placeholder={evForm.type === 'capex' ? 'Amount to capitalise (₹) *' : evForm.type === 'disposal' ? 'Sale proceeds (₹, optional)' : 'Write-off value (₹, optional)'}
                      value={evForm.amount ?? ''} onChange={(e) => setEvForm((s) => ({ ...s, amount: e.target.value }))}
                      className="mb-2 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
                  )}
                  <textarea rows={2} placeholder="Reason *" value={evForm.reason || ''} onChange={(e) => setEvForm((s) => ({ ...s, reason: e.target.value }))}
                    className="w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
                  <button onClick={submitEvent} disabled={!evValid || raiseEv.isPending}
                    className="mt-2 rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {raiseEv.isPending ? 'Submitting…' : 'Submit request'}
                  </button>
                </div>
              )}

              {/* history timeline */}
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">History</p>
                <ol className="space-y-2 border-l border-line pl-4">
                  {[...(a.history || [])].reverse().map((h) => (
                    <li key={h.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-pine" />
                      <span className="font-medium text-ink">{ACTION_LABEL[h.action] || h.action}</span>
                      {h.by?.name && <span className="text-ink-soft"> · {h.by.name}</span>}
                      <span className="text-ink-soft"> · {fmtDT(h.createdAt)}</span>
                      {h.note && <p className="text-ink-soft">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* finance review panel */}
            {canApprove && financeGate && (
              <div className="border-t border-line bg-ochre-tint/40 px-5 py-3">
                <p className="mb-2 text-xs font-medium text-ochre">Set finance fields before approving</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={fin?.glCodeId ?? a.glCodeId ?? ''} onChange={(e) => setFin((s) => ({ ...(s || {}), glCodeId: e.target.value }))} className="rounded-lg border border-line px-2 py-1.5 text-sm">
                    <option value="">GL code…</option>
                    {glCodes.map((g) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                  </select>
                  <input type="date" value={fin?.datePutToUse ?? (a.datePutToUse ? a.datePutToUse.slice(0, 10) : '')} onChange={(e) => setFin((s) => ({ ...(s || {}), datePutToUse: e.target.value }))} className="rounded-lg border border-line px-2 py-1.5 text-sm" />
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fin?.itcEligible ?? a.itcEligible ?? false} onChange={(e) => setFin((s) => ({ ...(s || {}), itcEligible: e.target.checked }))} />
                    GST Input Tax Credit eligible
                  </label>
                  <input placeholder="Reason for finance edit *" value={fin?.reason ?? ''} onChange={(e) => setFin((s) => ({ ...(s || {}), reason: e.target.value }))} className="col-span-2 rounded-lg border border-line px-2 py-1.5 text-sm" />
                </div>
                <button
                  onClick={() => saveFin.mutate({ id: a.id, patch: { glCodeId: fin?.glCodeId ?? a.glCodeId, itcEligible: fin?.itcEligible ?? a.itcEligible, datePutToUse: fin?.datePutToUse ?? a.datePutToUse, reason: fin?.reason } })}
                  disabled={saveFin.isPending || !(fin?.reason)}
                  className="mt-2 rounded-lg bg-ochre px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {saveFin.isPending ? 'Saving…' : 'Save finance fields'}
                </button>
              </div>
            )}

            {err && <p className="border-t border-line bg-brick/5 px-5 py-2 text-sm text-brick">{err}</p>}

            {(canSubmit || canApprove || canAck || canVoid || canActOnEvent) && (
              <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-5 py-3">
                {canActOnEvent && (
                  <>
                    <button onClick={() => approveEv.mutate({ eventId: pendingEvent.id, note: undefined })} disabled={approveEv.isPending}
                      className="rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {approveEv.isPending ? 'Approving…' : `Approve ${EVENT_TYPES[pendingEvent.type]?.label.toLowerCase()}`}
                    </button>
                    <button onClick={() => { const reason = prompt('Reason for rejecting this request:'); if (reason) rejectEv.mutate({ eventId: pendingEvent.id, reason }); }}
                      disabled={rejectEv.isPending}
                      className="rounded-lg border border-brick/40 px-4 py-2 text-sm font-medium text-brick disabled:opacity-50">Reject</button>
                  </>
                )}
                {canSubmit && (
                  <button onClick={() => submit.mutate(a.id)} disabled={submit.isPending}
                    className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Submit for approval</button>
                )}
                {canApprove && (
                  <>
                    <button
                      onClick={() => approve.mutate({ id: a.id, note: undefined })}
                      disabled={approve.isPending || financeGate}
                      title={financeGate ? 'Set finance fields first' : ''}
                      className="rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {approve.isPending ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => { const reason = prompt('Reason for sending back to the creator:'); if (reason) sendback.mutate({ id: a.id, reason }); }}
                      disabled={sendback.isPending}
                      className="rounded-lg border border-brick/40 px-4 py-2 text-sm font-medium text-brick disabled:opacity-50">Send back</button>
                  </>
                )}
                {canAck && (
                  <button onClick={() => ack.mutate(a.id)} disabled={ack.isPending}
                    className="rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {ack.isPending ? 'Confirming…' : 'Acknowledge receipt'}
                  </button>
                )}
                {canVoid && (
                  <button onClick={() => { const reason = prompt('Reason to void this entry (no hard delete):'); if (reason) voidIt.mutate({ id: a.id, reason }); }}
                    disabled={voidIt.isPending}
                    className="ml-auto rounded-lg px-3 py-2 text-sm text-brick hover:bg-brick/5">Void entry</button>
                )}
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}
