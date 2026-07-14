// AssetHub — asset records + the approval workflow engine (PRD §5–§8).
// Chain = the matching approval band's role sequence, snapshotted at submit.
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';

const FINANCE_ROLES = ['FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO'];
const PENDING = ['pending_branch', 'pending_finance_review', 'pending_finance_approval'];
export const ACK_ESCALATE_HOURS = 48;

const DETAIL_INCLUDE = {
  category: { select: { id: true, code: true, name: true } },
  subCategory: { select: { id: true, code: true, name: true } },
  site: { select: { id: true, code: true, name: true } },
  building: { select: { id: true, code: true, name: true } },
  room: { select: { id: true, number: true } },
  custodian: { select: { id: true, name: true, designation: true } },
  vendor: { select: { id: true, code: true, name: true } },
  glCode: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

// ── roles & scopes ───────────────────────────────────────────────────
async function rolesOf(userId) {
  return prisma.assetRoleAssignment.findMany({ where: { userId } });
}
const hasRole = (roles, role) => roles.some((r) => r.role === role);
const isHubAdmin = (user, roles) => canAdmin(user) || hasRole(roles, 'ASSET_ADMIN');

// Does one of my assignments for `role` cover this asset's location?
function scopeCovers(roles, role, asset) {
  return roles.some((r) => {
    if (r.role !== role) return false;
    if (!r.siteId && !r.buildingId) return true; // global
    if (r.buildingId) return r.buildingId === asset.buildingId;
    return r.siteId === asset.siteId; // site-wide
  });
}

// ── helpers ──────────────────────────────────────────────────────────
async function loadAsset(id) {
  const a = await prisma.assetRecord.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!a) throw new ApiError(404, 'Asset not found');
  return a;
}

async function log(assetId, action, byId, note, meta) {
  await prisma.assetHistory.create({ data: { assetId, action, byId: byId || null, note: note || null, meta: meta || undefined } });
}

async function generateTag(siteId, buildingId, subCategoryId) {
  const [site, bldg, sub] = await Promise.all([
    prisma.assetSite.findUnique({ where: { id: siteId } }),
    prisma.assetBuilding.findUnique({ where: { id: buildingId } }),
    prisma.assetSubCategory.findUnique({ where: { id: subCategoryId } }),
  ]);
  if (!site || !bldg || !sub) throw new ApiError(400, 'Invalid site, building or sub-category');
  const prefix = `${site.code}-${bldg.code}-${sub.code}-`;
  const count = await prisma.assetRecord.count({ where: { assetTag: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

const computeTotal = (d) => {
  const t = d.taxableValue != null ? Number(d.taxableValue) : null;
  const g = d.gstAmount != null ? Number(d.gstAmount) : null;
  if (t != null || g != null) return (t || 0) + (g || 0);
  return d.totalValue != null ? Number(d.totalValue) : null;
};

// Status label for a chain position (PRD §8 statuses).
function statusFor(chain, index) {
  if (index >= chain.length) return 'pending_ack';
  if (index === 0) return 'pending_branch';
  return chain[index] === 'FINANCE_EXECUTIVE' ? 'pending_finance_review' : 'pending_finance_approval';
}

const CREATE_FIELDS = [
  'categoryId', 'subCategoryId', 'description', 'make', 'model', 'serialNumber',
  'siteId', 'buildingId', 'roomId', 'custodianId', 'dateOfPurchase', 'vendorId',
  'invoiceNumber', 'taxableValue', 'gstAmount', 'totalValue', 'photoUrl', 'invoiceUrl',
  'warrantyMonths', 'insured', 'insurancePolicyNo', 'insuranceExpiry', 'remarks', 'legacy',
];
const FINANCE_FIELDS = ['glCodeId', 'itcEligible', 'itcBlockReason', 'datePutToUse', 'capitalisationMethod', 'deemedCostBasis'];

function pick(input, fields) {
  const out = {};
  for (const k of fields) if (input[k] !== undefined) out[k] = input[k] === '' ? null : input[k];
  if (out.taxableValue != null) out.taxableValue = Number(out.taxableValue);
  if (out.gstAmount != null) out.gstAmount = Number(out.gstAmount);
  if (out.totalValue != null) out.totalValue = Number(out.totalValue);
  if (out.warrantyMonths != null) out.warrantyMonths = parseInt(out.warrantyMonths, 10) || null;
  if (out.insured !== undefined) out.insured = !!out.insured;
  if (out.legacy !== undefined) out.legacy = !!out.legacy;
  if (out.itcEligible !== undefined && out.itcEligible !== null) out.itcEligible = !!out.itcEligible;
  return out;
}

// ── create / edit ────────────────────────────────────────────────────
// Whoever may create, and only within their location scope (admins are global).
function assertCanCreateAt(user, roles, loc) {
  const canCreate = isHubAdmin(user, roles) || hasRole(roles, 'OPERATIONS') || hasRole(roles, 'BRANCH_MANAGER');
  if (!canCreate) throw new ApiError(403, 'You need the Operations role to create assets');
  if (!isHubAdmin(user, roles)) {
    const opsOk = scopeCovers(roles, 'OPERATIONS', loc) || scopeCovers(roles, 'BRANCH_MANAGER', loc);
    if (!opsOk) throw new ApiError(403, 'That location is outside your Operations scope');
  }
}

async function assertActiveCustodians(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return;
  const found = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, status: true } });
  const byId = new Map(found.map((u) => [u.id, u.status]));
  for (const id of uniq) {
    if (byId.get(id) !== 'active') throw new ApiError(400, 'Every custodian must be an active employee');
  }
}

export async function createAsset(user, input) {
  const roles = await rolesOf(user.id);
  const d = pick(input, CREATE_FIELDS);
  for (const k of ['categoryId', 'subCategoryId', 'description', 'siteId', 'buildingId', 'custodianId']) {
    if (!d[k]) throw new ApiError(400, 'Category, sub-category, description, site, building and custodian are required');
  }
  assertCanCreateAt(user, roles, d);
  await assertActiveCustodians([d.custodianId]);

  d.totalValue = computeTotal(d);
  const assetTag = await generateTag(d.siteId, d.buildingId, d.subCategoryId);
  const asset = await prisma.assetRecord.create({
    data: { ...d, assetTag, createdById: user.id, status: 'draft' },
    include: DETAIL_INCLUDE,
  });
  await log(asset.id, 'created', user.id, `Draft created (${assetTag})`);
  return asset;
}

// ── bulk create (N identical units, optionally per-unit room/serial/custodian) ──
export async function bulkCreateAssets(user, { base = {}, units = [] }) {
  const roles = await rolesOf(user.id);
  if (!Array.isArray(units) || units.length === 0) throw new ApiError(400, 'Add at least one unit');
  if (units.length > 200) throw new ApiError(400, 'Bulk create is limited to 200 units at a time');

  const d = pick(base, CREATE_FIELDS);
  for (const k of ['categoryId', 'subCategoryId', 'description', 'siteId', 'buildingId', 'custodianId']) {
    if (!d[k]) throw new ApiError(400, 'Category, sub-category, description, site, building and default custodian are required');
  }
  assertCanCreateAt(user, roles, d);
  d.totalValue = computeTotal(d);

  // Validate rooms belong to this building, custodians are active.
  const rooms = await prisma.assetRoom.findMany({ where: { buildingId: d.buildingId }, select: { id: true } });
  const roomOk = new Set(rooms.map((r) => r.id));
  const custodianIds = [d.custodianId];
  units.forEach((u, i) => {
    if (u.roomId && !roomOk.has(u.roomId)) throw new ApiError(400, `Row ${i + 1}: room does not belong to the selected building`);
    if (u.custodianId) custodianIds.push(u.custodianId);
  });
  await assertActiveCustodians(custodianIds);

  const [site, bldg, sub] = await Promise.all([
    prisma.assetSite.findUnique({ where: { id: d.siteId } }),
    prisma.assetBuilding.findUnique({ where: { id: d.buildingId } }),
    prisma.assetSubCategory.findUnique({ where: { id: d.subCategoryId } }),
  ]);
  if (!site || !bldg || !sub) throw new ApiError(400, 'Invalid site, building or sub-category');
  const prefix = `${site.code}-${bldg.code}-${sub.code}-`;
  const start = await prisma.assetRecord.count({ where: { assetTag: { startsWith: prefix } } });
  const batchId = randomUUID();

  const created = await prisma.$transaction(
    units.map((u, i) => prisma.assetRecord.create({
      data: {
        ...d,
        roomId: u.roomId || d.roomId || null,
        serialNumber: u.serialNumber || d.serialNumber || null,
        custodianId: u.custodianId || d.custodianId,
        assetTag: `${prefix}${String(start + 1 + i).padStart(4, '0')}`,
        bulkBatchId: batchId,
        createdById: user.id,
        status: 'draft',
      },
      select: { id: true, assetTag: true },
    })),
  );
  await prisma.assetHistory.createMany({
    data: created.map((a) => ({ assetId: a.id, action: 'created', byId: user.id, note: `Bulk draft (${a.assetTag})` })),
  });
  return { batchId, count: created.length, tags: created.map((a) => a.assetTag) };
}

// ── legacy CSV import (one building at a time; deemed-cost, Legacy flag) ──
export async function bulkImportLegacy(user, { siteId, buildingId, categoryId, rows = [] }) {
  const roles = await rolesOf(user.id);
  if (!siteId || !buildingId || !categoryId) throw new ApiError(400, 'Choose a site, building and category for the import');
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError(400, 'The file has no rows');
  if (rows.length > 500) throw new ApiError(400, 'Import up to 500 rows at a time');
  assertCanCreateAt(user, roles, { siteId, buildingId });

  const [subs, rooms] = await Promise.all([
    prisma.assetSubCategory.findMany({ where: { categoryId }, select: { id: true, code: true, name: true } }),
    prisma.assetRoom.findMany({ where: { buildingId }, select: { id: true, number: true } }),
  ]);
  const subByCode = new Map(subs.map((s) => [s.code.toUpperCase(), s]));
  const subByName = new Map(subs.map((s) => [s.name.toLowerCase(), s]));
  const roomByNo = new Map(rooms.map((r) => [String(r.number).toLowerCase(), r]));

  // Resolve custodians (row value = Employee Number = User.id) in one query.
  const empNos = [...new Set(rows.map((r) => (r.custodian || '').trim()).filter(Boolean))];
  const users = empNos.length
    ? await prisma.user.findMany({ where: { id: { in: empNos } }, select: { id: true, status: true } })
    : [];
  const userOk = new Map(users.map((u) => [u.id, u.status]));

  const errors = [];
  const clean = rows.map((r, i) => {
    const n = i + 1;
    const key = (r.subCategory || '').trim();
    const sub = subByCode.get(key.toUpperCase()) || subByName.get(key.toLowerCase());
    if (!key) errors.push({ row: n, message: 'Missing sub-category' });
    else if (!sub) errors.push({ row: n, message: `Unknown sub-category "${key}"` });
    if (!(r.description || '').trim()) errors.push({ row: n, message: 'Missing description' });

    const cust = (r.custodian || '').trim();
    if (!cust) errors.push({ row: n, message: 'Missing custodian (employee number)' });
    else if (userOk.get(cust) !== 'active') errors.push({ row: n, message: `Custodian "${cust}" is not an active employee` });

    let roomId = null;
    if ((r.room || '').trim()) {
      const room = roomByNo.get(String(r.room).trim().toLowerCase());
      if (!room) errors.push({ row: n, message: `Room "${r.room}" not found in this building` });
      else roomId = room.id;
    }
    const deemed = r.deemedCost != null && r.deemedCost !== '' ? Number(r.deemedCost) : null;
    if (deemed != null && Number.isNaN(deemed)) errors.push({ row: n, message: 'Deemed cost is not a number' });

    return {
      subCategoryId: sub?.id, description: (r.description || '').trim(), make: (r.make || '').trim() || null,
      model: (r.model || '').trim() || null, serialNumber: (r.serialNumber || '').trim() || null,
      custodianId: cust, roomId, dateOfPurchase: (r.dateOfPurchase || '').trim() || null,
      totalValue: deemed, taxableValue: deemed,
    };
  });
  if (errors.length) throw new ApiError(422, `${errors.length} row(s) need fixing`, errors);

  const [site, bldg] = await Promise.all([
    prisma.assetSite.findUnique({ where: { id: siteId } }),
    prisma.assetBuilding.findUnique({ where: { id: buildingId } }),
  ]);
  if (!site || !bldg) throw new ApiError(400, 'Invalid site or building');
  const batchId = randomUUID();

  // Tags are per sub-category — track running counts across the batch.
  const counts = {};
  for (const sub of subs) {
    const prefix = `${site.code}-${bldg.code}-${sub.code}-`;
    counts[sub.id] = { prefix, n: await prisma.assetRecord.count({ where: { assetTag: { startsWith: prefix } } }) };
  }
  const created = await prisma.$transaction(clean.map((c) => {
    const t = counts[c.subCategoryId];
    t.n += 1;
    return prisma.assetRecord.create({
      data: {
        categoryId, siteId, buildingId,
        subCategoryId: c.subCategoryId, description: c.description, make: c.make, model: c.model,
        serialNumber: c.serialNumber, custodianId: c.custodianId, roomId: c.roomId,
        dateOfPurchase: c.dateOfPurchase, taxableValue: c.taxableValue, totalValue: c.totalValue,
        capitalisationMethod: 'deemed_cost', deemedCostBasis: c.totalValue != null ? 'imported' : null,
        legacy: true, assetTag: `${t.prefix}${String(t.n).padStart(4, '0')}`,
        bulkBatchId: batchId, createdById: user.id, status: 'draft',
      },
      select: { id: true, assetTag: true },
    });
  }));
  await prisma.assetHistory.createMany({
    data: created.map((a) => ({ assetId: a.id, action: 'created', byId: user.id, note: `Legacy import (${a.assetTag})` })),
  });
  return { batchId, count: created.length };
}

// ── room assignment (physical location within a building) ──
export async function assignRoom(user, id, roomId) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (['void', 'disposed', 'written_off'].includes(asset.status)) throw new ApiError(400, 'This asset is no longer in service');
  const canDo = isHubAdmin(user, roles) || scopeCovers(roles, 'OPERATIONS', asset) || scopeCovers(roles, 'BRANCH_MANAGER', asset);
  if (!canDo) throw new ApiError(403, 'That location is outside your scope');

  let room = null;
  if (roomId) {
    room = await prisma.assetRoom.findUnique({ where: { id: roomId }, select: { id: true, number: true, buildingId: true } });
    if (!room || room.buildingId !== asset.buildingId) throw new ApiError(400, 'Room must belong to this asset\'s building');
  }
  const updated = await prisma.assetRecord.update({ where: { id }, data: { roomId: roomId || null }, include: DETAIL_INCLUDE });
  await log(id, 'room_assigned', user.id, room ? `Assigned to room ${room.number}` : 'Room cleared',
    { from: asset.room?.number || null, to: room?.number || null });
  return updated;
}

export async function bulkAssignRoom(user, { ids = [], roomId }) {
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'Select at least one asset');
  const results = [];
  for (const id of ids) results.push(await assignRoom(user, id, roomId));
  return { count: results.length };
}

export async function updateAsset(user, id, input) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);

  if (asset.status === 'draft') {
    if (asset.createdById !== user.id && !isHubAdmin(user, roles)) {
      throw new ApiError(403, 'Only the creator can edit a draft');
    }
    const d = pick(input, [...CREATE_FIELDS, ...FINANCE_FIELDS]);
    d.totalValue = computeTotal({ ...asset, ...d });
    const updated = await prisma.assetRecord.update({ where: { id }, data: d, include: DETAIL_INCLUDE });
    return updated;
  }

  // During finance stages, finance roles may set finance fields (and correct
  // ops fields) — reason mandatory, change logged (PRD §8 rules).
  if (['pending_finance_review', 'pending_finance_approval'].includes(asset.status)) {
    const isFinance = FINANCE_ROLES.some((r) => hasRole(roles, r)) || isHubAdmin(user, roles);
    if (!isFinance) throw new ApiError(403, 'Only Finance can edit at this stage');
    const reason = (input.reason || '').trim();
    if (!reason) throw new ApiError(400, 'A reason is mandatory for finance edits');
    const d = pick(input, [...FINANCE_FIELDS, ...CREATE_FIELDS]);
    d.totalValue = computeTotal({ ...asset, ...d });
    const changes = {};
    for (const k of Object.keys(d)) if (String(asset[k] ?? '') !== String(d[k] ?? '')) changes[k] = [asset[k], d[k]];
    const updated = await prisma.assetRecord.update({ where: { id }, data: d, include: DETAIL_INCLUDE });
    await log(id, 'finance_edited', user.id, reason, changes);
    return updated;
  }

  throw new ApiError(400, `Cannot edit an asset while it is ${asset.status.replaceAll('_', ' ')}`);
}

// ── workflow actions ─────────────────────────────────────────────────
export async function submitAsset(user, id) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (asset.status !== 'draft') throw new ApiError(400, 'Only drafts can be submitted');
  if (asset.createdById !== user.id && !isHubAdmin(user, roles)) throw new ApiError(403, 'Only the creator can submit');

  if (!asset.photoUrl) throw new ApiError(400, 'A photo is mandatory before submitting');
  if (!asset.legacy && !asset.invoiceUrl) throw new ApiError(400, 'Invoice PDF is mandatory for new purchases (mark as Legacy if none exists)');
  if (!asset.dateOfPurchase) throw new ApiError(400, 'Date of purchase is required (estimate for legacy)');

  const bands = await prisma.assetApprovalBand.findMany({ orderBy: { sort: 'asc' } });
  if (!bands.length) throw new ApiError(400, 'Approval matrix is not configured — set it up in AssetHub → Setup');
  const value = asset.totalValue || 0;
  const band = bands.find((b) => value >= b.minValue && (b.maxValue == null || value <= b.maxValue)) || bands[0];

  const updated = await prisma.assetRecord.update({
    where: { id },
    data: { status: statusFor(band.approvers, 0), approvalChain: band.approvers, chainIndex: 0, submittedAt: new Date() },
    include: DETAIL_INCLUDE,
  });
  await log(id, 'submitted', user.id, `Submitted for approval (${band.label || 'band'}: ${band.approvers.join(' → ')})`);
  return updated;
}

export async function approveAsset(user, id, note) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (!PENDING.includes(asset.status)) throw new ApiError(400, 'This asset is not awaiting approval');

  const requiredRole = asset.approvalChain[asset.chainIndex];
  if (!requiredRole) throw new ApiError(400, 'Approval chain is exhausted');
  // Maker-checker is absolute — the creator can never approve their own entry.
  if (asset.createdById === user.id) throw new ApiError(403, 'Maker-checker: you cannot approve an entry you created');

  const allowed = requiredRole === 'BRANCH_MANAGER'
    ? scopeCovers(roles, 'BRANCH_MANAGER', asset)
    : hasRole(roles, requiredRole);
  if (!allowed) throw new ApiError(403, `This step needs the ${requiredRole.replaceAll('_', ' ').toLowerCase()} role${requiredRole === 'BRANCH_MANAGER' ? ' for this location' : ''}`);

  // Finance approvers must have completed the finance fields first.
  if (FINANCE_ROLES.includes(requiredRole)) {
    if (!asset.glCodeId || asset.itcEligible == null || !asset.datePutToUse) {
      throw new ApiError(400, 'Set GL code, ITC eligibility and Date Put to Use before approving');
    }
    if (asset.itcEligible === false && !asset.itcBlockReason) throw new ApiError(400, 'ITC block reason is required when ITC is No');
    if (asset.legacy && !asset.capitalisationMethod) throw new ApiError(400, 'Capitalisation method is required for legacy assets');
  }

  const nextIndex = asset.chainIndex + 1;
  const done = nextIndex >= asset.approvalChain.length;
  const updated = await prisma.assetRecord.update({
    where: { id },
    data: {
      chainIndex: nextIndex,
      status: statusFor(asset.approvalChain, nextIndex),
      ...(done ? { ackRequestedAt: new Date() } : {}),
    },
    include: DETAIL_INCLUDE,
  });
  await log(id, 'approved', user.id, note || `Approved (${requiredRole.replaceAll('_', ' ').toLowerCase()})`);
  return updated;
}

export async function sendBack(user, id, reason) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (!PENDING.includes(asset.status)) throw new ApiError(400, 'This asset is not in an approval stage');
  if (!(reason || '').trim()) throw new ApiError(400, 'A reason is required to send back');

  const requiredRole = asset.approvalChain[asset.chainIndex];
  const allowed = isHubAdmin(user, roles) || (requiredRole === 'BRANCH_MANAGER'
    ? scopeCovers(roles, 'BRANCH_MANAGER', asset)
    : hasRole(roles, requiredRole));
  if (!allowed) throw new ApiError(403, 'Only the current approver can send this back');

  const updated = await prisma.assetRecord.update({
    where: { id },
    data: { status: 'draft', chainIndex: 0, approvalChain: [], submittedAt: null },
    include: DETAIL_INCLUDE,
  });
  await log(id, 'sent_back', user.id, reason.trim());
  return updated;
}

export async function acknowledgeAsset(user, id) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (asset.status !== 'pending_ack') throw new ApiError(400, 'This asset is not awaiting acknowledgement');

  const overdue = asset.ackRequestedAt && (Date.now() - asset.ackRequestedAt.getTime()) > ACK_ESCALATE_HOURS * 3600e3;
  const isCustodian = asset.custodianId === user.id;
  const escalated = overdue && (scopeCovers(roles, 'BRANCH_MANAGER', asset) || isHubAdmin(user, roles));
  if (!isCustodian && !escalated) {
    throw new ApiError(403, overdue ? 'Only the custodian or their Branch Manager can acknowledge' : 'Only the custodian can acknowledge');
  }

  const updated = await prisma.assetRecord.update({
    where: { id },
    data: { status: 'active', acknowledgedAt: new Date() },
    include: DETAIL_INCLUDE,
  });
  await log(id, 'acknowledged', user.id, isCustodian ? 'Custodian confirmed receipt' : 'Acknowledged by Branch Manager (48h escalation)');
  return updated;
}

export async function voidAsset(user, id, reason) {
  const asset = await loadAsset(id);
  const roles = await rolesOf(user.id);
  if (!['draft', ...PENDING].includes(asset.status)) throw new ApiError(400, 'Only entries not yet active can be voided');
  if (asset.createdById !== user.id && !isHubAdmin(user, roles)) throw new ApiError(403, 'Only the creator or an admin can void');
  if (!(reason || '').trim()) throw new ApiError(400, 'A reason is required to void');

  const updated = await prisma.assetRecord.update({ where: { id }, data: { status: 'void' }, include: DETAIL_INCLUDE });
  await log(id, 'voided', user.id, reason.trim());
  return updated;
}

// ── reads ────────────────────────────────────────────────────────────
export async function listAssets(user, { q, status, categoryId, siteId, buildingId, custodianId } = {}) {
  const roles = await rolesOf(user.id);
  const seesAll = isHubAdmin(user, roles) || FINANCE_ROLES.some((r) => hasRole(roles, r));

  const where = {};
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (siteId) where.siteId = siteId;
  if (buildingId) where.buildingId = buildingId;
  if (custodianId) where.custodianId = custodianId;
  if (q?.trim()) {
    where.OR = [
      { assetTag: { contains: q.trim(), mode: 'insensitive' } },
      { description: { contains: q.trim(), mode: 'insensitive' } },
      { serialNumber: { contains: q.trim(), mode: 'insensitive' } },
    ];
  }

  if (!seesAll) {
    // Own-location scopes (Operations / Branch Manager) + always my own items.
    const scoped = roles.filter((r) => ['OPERATIONS', 'BRANCH_MANAGER'].includes(r.role));
    const global = scoped.some((r) => !r.siteId && !r.buildingId);
    if (!global) {
      const siteIds = scoped.filter((r) => r.siteId && !r.buildingId).map((r) => r.siteId);
      const bldgIds = scoped.filter((r) => r.buildingId).map((r) => r.buildingId);
      where.AND = [{
        OR: [
          { custodianId: user.id },
          { createdById: user.id },
          ...(siteIds.length ? [{ siteId: { in: siteIds } }] : []),
          ...(bldgIds.length ? [{ buildingId: { in: bldgIds } }] : []),
        ],
      }];
    }
  }

  const rows = await prisma.assetRecord.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 500, include: DETAIL_INCLUDE,
  });
  return rows;
}

export async function getAsset(user, id) {
  const asset = await loadAsset(id);
  const history = await prisma.assetHistory.findMany({
    where: { assetId: id },
    orderBy: { createdAt: 'asc' },
    include: { by: { select: { id: true, name: true } } },
  });
  return { ...asset, history };
}

// What's waiting on me — used by the Approvals tab AND the notification bell.
export async function approvalQueue(user) {
  const roles = await rolesOf(user.id);
  const admin = isHubAdmin(user, roles);
  const pending = await prisma.assetRecord.findMany({
    where: { status: { in: PENDING } }, orderBy: { submittedAt: 'asc' }, include: DETAIL_INCLUDE,
  });

  const toApprove = pending.filter((a) => {
    if (a.createdById === user.id) return false; // maker-checker
    const role = a.approvalChain[a.chainIndex];
    if (!role) return false;
    if (role === 'BRANCH_MANAGER') return scopeCovers(roles, 'BRANCH_MANAGER', a) || admin;
    return hasRole(roles, role) || admin;
  });

  const acks = await prisma.assetRecord.findMany({
    where: { status: 'pending_ack' }, orderBy: { ackRequestedAt: 'asc' }, include: DETAIL_INCLUDE,
  });
  const now = Date.now();
  const toAcknowledge = acks.filter((a) => {
    if (a.custodianId === user.id) return true;
    const overdue = a.ackRequestedAt && now - a.ackRequestedAt.getTime() > ACK_ESCALATE_HOURS * 3600e3;
    return overdue && (scopeCovers(roles, 'BRANCH_MANAGER', a) || admin);
  }).map((a) => ({
    ...a,
    escalated: !!(a.ackRequestedAt && now - a.ackRequestedAt.getTime() > ACK_ESCALATE_HOURS * 3600e3),
  }));

  return { toApprove, toAcknowledge };
}
