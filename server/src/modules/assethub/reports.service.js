// AssetHub — reports & the field-level audit trail (PRD §11).
// One tabular endpoint returns { title, columns, rows, totals } so the client can
// render + export any report generically.
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';

const ROLE_KEYS = ['OPERATIONS', 'BRANCH_MANAGER', 'FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO'];
const LIVE = ['active', 'under_repair', 'in_transfer', 'pending_ack'];
const PENDING = ['pending_branch', 'pending_finance_review', 'pending_finance_approval', 'pending_ack'];

async function rolesOf(userId) { return prisma.assetRoleAssignment.findMany({ where: { userId } }); }
async function assertReportAccess(user) {
  const roles = await rolesOf(user.id);
  const ok = canAdmin(user) || roles.some((r) => r.role === 'ASSET_ADMIN' || ROLE_KEYS.includes(r.role));
  if (!ok) throw new ApiError(403, 'AssetHub reports are limited to asset roles');
}

const A_INCLUDE = {
  category: { select: { name: true } },
  subCategory: { select: { name: true } },
  site: { select: { name: true } },
  building: { select: { name: true } },
  room: { select: { number: true } },
  custodian: { select: { name: true } },
  glCode: { select: { code: true } },
};

const days = (from) => (from ? Math.floor((Date.now() - new Date(from).getTime()) / 86400e3) : null);
const loc = (a) => [a.site?.name, a.building?.name, a.room ? `Room ${a.room.number}` : null].filter(Boolean).join(' › ');

export const REPORT_TYPES = [
  ['register', 'Asset Register', 'Every asset on the books'],
  ['by_location', 'By Location', 'Count & value per site / building'],
  ['by_category', 'By Category', 'Count & value per category'],
  ['by_custodian', 'By Custodian', 'Who holds what'],
  ['transfers', 'Transfers', 'Approved asset movements'],
  ['disposals', 'Disposals', 'Disposed assets & proceeds'],
  ['writeoffs', 'Write-offs', 'Written-off assets & value'],
  ['under_repair', 'Under Repair', 'Assets currently under repair'],
  ['pending', 'Pending & Aging', 'Stuck in approval / acknowledgement'],
  ['gst_itc', 'GST / ITC', 'Input-tax-credit eligibility & GST'],
  ['verification', 'Verification', 'Physical verification variance'],
];

export async function kpis(user) {
  await assertReportAccess(user);
  const assets = await prisma.assetRecord.findMany({ where: { status: { not: 'void' } }, include: A_INCLUDE });
  const live = assets.filter((a) => LIVE.includes(a.status));
  const bookValue = live.reduce((s, a) => s + (a.totalValue || 0), 0);

  const byStatus = {};
  for (const a of assets) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  const catMap = new Map();
  for (const a of live) {
    const k = a.category?.name || '—';
    const e = catMap.get(k) || { count: 0, value: 0 };
    e.count += 1; e.value += a.totalValue || 0; catMap.set(k, e);
  }
  const siteMap = new Map();
  for (const a of live) {
    const k = a.site?.name || '—';
    const e = siteMap.get(k) || { count: 0, value: 0 };
    e.count += 1; e.value += a.totalValue || 0; siteMap.set(k, e);
  }
  return {
    totalAssets: assets.length,
    liveAssets: live.length,
    bookValue,
    pending: assets.filter((a) => PENDING.includes(a.status)).length,
    underRepair: byStatus.under_repair || 0,
    disposed: byStatus.disposed || 0,
    writtenOff: byStatus.written_off || 0,
    byStatus,
    byCategory: [...catMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value),
    bySite: [...siteMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value),
  };
}

function grouped(assets, keyFn, label) {
  const map = new Map();
  for (const a of assets) {
    const k = keyFn(a) || '—';
    const e = map.get(k) || { group: k, count: 0, value: 0 };
    e.count += 1; e.value += a.totalValue || 0; map.set(k, e);
  }
  const rows = [...map.values()].sort((a, b) => b.value - a.value);
  return {
    columns: [{ key: 'group', label }, { key: 'count', label: 'Assets', align: 'right' }, { key: 'value', label: 'Book value', align: 'right', money: true }],
    rows,
    totals: { count: rows.reduce((s, r) => s + r.count, 0), value: rows.reduce((s, r) => s + r.value, 0) },
  };
}

export async function report(user, type) {
  await assertReportAccess(user);

  if (['transfers', 'disposals', 'writeoffs'].includes(type)) {
    const evType = type === 'transfers' ? 'transfer' : type === 'disposals' ? 'disposal' : 'write_off';
    const events = await prisma.assetEvent.findMany({
      where: { type: evType, status: 'approved' }, orderBy: { decidedAt: 'desc' },
      include: { asset: { include: A_INCLUDE }, requestedBy: { select: { name: true } } },
    });
    if (type === 'transfers') {
      const bIds = [...new Set(events.map((e) => e.toBuildingId).filter(Boolean))];
      const blds = bIds.length ? await prisma.assetBuilding.findMany({ where: { id: { in: bIds } }, select: { id: true, name: true } }) : [];
      const bMap = new Map(blds.map((b) => [b.id, b.name]));
      return {
        title: 'Transfers', columns: [
          { key: 'assetTag', label: 'Asset ID' }, { key: 'description', label: 'Description' },
          { key: 'to', label: 'Moved to' }, { key: 'by', label: 'Requested by' }, { key: 'date', label: 'Date' },
        ],
        rows: events.map((e) => ({ assetTag: e.asset.assetTag, description: e.asset.description, to: bMap.get(e.toBuildingId) || '—', by: e.requestedBy?.name, date: e.decidedAt })),
      };
    }
    const rows = events.map((e) => ({ assetTag: e.asset.assetTag, description: e.asset.description, amount: e.amount ?? null, reason: e.reason, by: e.requestedBy?.name, date: e.decidedAt }));
    return {
      title: type === 'disposals' ? 'Disposals' : 'Write-offs',
      columns: [
        { key: 'assetTag', label: 'Asset ID' }, { key: 'description', label: 'Description' },
        { key: 'amount', label: type === 'disposals' ? 'Proceeds' : 'Value', align: 'right', money: true },
        { key: 'reason', label: 'Reason' }, { key: 'by', label: 'By' }, { key: 'date', label: 'Date' },
      ],
      rows,
      totals: { amount: rows.reduce((s, r) => s + (r.amount || 0), 0) },
    };
  }

  if (type === 'verification') {
    const sessions = await prisma.verificationSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { conductedBy: { select: { name: true } }, lines: { select: { result: true } }, counts: { select: { expected: true, actual: true } } },
    });
    const bIds = [...new Set(sessions.map((s) => s.buildingId))];
    const blds = bIds.length ? await prisma.assetBuilding.findMany({ where: { id: { in: bIds } }, select: { id: true, name: true } }) : [];
    const bMap = new Map(blds.map((b) => [b.id, b.name]));
    const rows = sessions.map((s) => {
      let variance;
      if (s.mode === 'item') variance = s.lines.filter((l) => l.result === 'missing').length;
      else variance = s.counts.reduce((v, c) => v + (c.actual != null ? c.actual - c.expected : 0), 0);
      return { title: s.title, building: bMap.get(s.buildingId), mode: s.mode === 'item' ? 'Item' : 'Count', by: s.conductedBy?.name, variance, status: s.status, date: s.createdAt };
    });
    return {
      title: 'Verification', columns: [
        { key: 'title', label: 'Verification' }, { key: 'building', label: 'Building' }, { key: 'mode', label: 'Mode' },
        { key: 'by', label: 'By' }, { key: 'variance', label: 'Variance', align: 'right' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' },
      ],
      rows,
    };
  }

  // asset-based reports
  const assets = await prisma.assetRecord.findMany({ where: { status: { not: 'void' } }, orderBy: { assetTag: 'asc' }, include: A_INCLUDE });

  if (type === 'by_location') return { title: 'Assets by Location', ...grouped(assets.filter((a) => LIVE.includes(a.status)), (a) => [a.site?.name, a.building?.name].filter(Boolean).join(' › '), 'Location') };
  if (type === 'by_category') return { title: 'Assets by Category', ...grouped(assets.filter((a) => LIVE.includes(a.status)), (a) => a.category?.name, 'Category') };
  if (type === 'by_custodian') return { title: 'Assets by Custodian', ...grouped(assets.filter((a) => LIVE.includes(a.status)), (a) => a.custodian?.name, 'Custodian') };

  if (type === 'under_repair') {
    const rows = assets.filter((a) => a.status === 'under_repair').map((a) => ({ assetTag: a.assetTag, description: a.description, location: loc(a), custodian: a.custodian?.name, value: a.totalValue }));
    return { title: 'Assets Under Repair', columns: [{ key: 'assetTag', label: 'Asset ID' }, { key: 'description', label: 'Description' }, { key: 'location', label: 'Location' }, { key: 'custodian', label: 'Custodian' }, { key: 'value', label: 'Value', align: 'right', money: true }], rows };
  }

  if (type === 'pending') {
    const rows = assets.filter((a) => PENDING.includes(a.status)).map((a) => ({
      assetTag: a.assetTag, description: a.description, status: a.status.replaceAll('_', ' '),
      age: days(a.status === 'pending_ack' ? a.ackRequestedAt : a.submittedAt), value: a.totalValue,
    })).sort((x, y) => (y.age || 0) - (x.age || 0));
    return { title: 'Pending & Aging', columns: [{ key: 'assetTag', label: 'Asset ID' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Stage' }, { key: 'age', label: 'Days waiting', align: 'right' }, { key: 'value', label: 'Value', align: 'right', money: true }], rows };
  }

  if (type === 'gst_itc') {
    const live = assets.filter((a) => LIVE.includes(a.status));
    const bucket = (k) => ({ group: k, count: 0, taxable: 0, gst: 0 });
    const map = { yes: bucket('ITC eligible'), no: bucket('ITC blocked'), unknown: bucket('Not set') };
    for (const a of live) {
      const b = a.itcEligible == null ? map.unknown : a.itcEligible ? map.yes : map.no;
      b.count += 1; b.taxable += a.taxableValue || 0; b.gst += a.gstAmount || 0;
    }
    const rows = Object.values(map).filter((r) => r.count > 0);
    return {
      title: 'GST / ITC Summary',
      columns: [{ key: 'group', label: 'ITC status' }, { key: 'count', label: 'Assets', align: 'right' }, { key: 'taxable', label: 'Taxable', align: 'right', money: true }, { key: 'gst', label: 'GST', align: 'right', money: true }],
      rows,
      totals: { count: rows.reduce((s, r) => s + r.count, 0), taxable: rows.reduce((s, r) => s + r.taxable, 0), gst: rows.reduce((s, r) => s + r.gst, 0) },
    };
  }

  // default: full register
  const rows = assets.map((a) => ({
    assetTag: a.assetTag, description: a.description, category: a.category?.name, subCategory: a.subCategory?.name,
    location: loc(a), custodian: a.custodian?.name, status: a.status.replaceAll('_', ' '),
    glCode: a.glCode?.code || '', legacy: a.legacy ? 'Yes' : '', value: a.totalValue,
  }));
  return {
    title: 'Asset Register',
    columns: [
      { key: 'assetTag', label: 'Asset ID' }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' },
      { key: 'subCategory', label: 'Sub-category' }, { key: 'location', label: 'Location' }, { key: 'custodian', label: 'Custodian' },
      { key: 'status', label: 'Status' }, { key: 'glCode', label: 'GL' }, { key: 'legacy', label: 'Legacy' }, { key: 'value', label: 'Value', align: 'right', money: true },
    ],
    rows,
    totals: { value: rows.reduce((s, r) => s + (r.value || 0), 0) },
  };
}

// Field-level audit trail — every logged action across assets, with change detail.
export async function auditTrail(user, { assetId, action, limit } = {}) {
  await assertReportAccess(user);
  const where = {};
  if (assetId) where.assetId = assetId;
  if (action) where.action = action;
  const rows = await prisma.assetHistory.findMany({
    where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 300, 1000),
    include: { by: { select: { name: true } }, asset: { select: { assetTag: true } } },
  });
  return rows.map((h) => ({
    id: h.id, assetTag: h.asset?.assetTag, action: h.action, by: h.by?.name || 'System',
    note: h.note, meta: h.meta || null, at: h.createdAt,
  }));
}
