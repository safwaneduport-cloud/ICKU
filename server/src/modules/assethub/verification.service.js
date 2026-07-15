// AssetHub — physical verification (PRD §10).
// A session audits a location against the register; variances route to write-off / damage.
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { isCeo } from '../../lib/access.js';
import { raiseEvent } from './assets.service.js';

// Assets that should physically exist (excludes draft / void / disposed / written_off).
const PRESENT = ['active', 'under_repair', 'in_transfer', 'pending_ack'];
const ROLE_KEYS = ['OPERATIONS', 'BRANCH_MANAGER', 'FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO'];

async function rolesOf(userId) { return prisma.assetRoleAssignment.findMany({ where: { userId } }); }
const isHubAdmin = (user, roles) => isCeo(user) || roles.some((r) => r.role === 'ASSET_ADMIN');
const hasAssetRole = (roles) => roles.some((r) => ROLE_KEYS.includes(r.role));
function scopeCovers(roles, loc) {
  return roles.some((r) => {
    if (!['OPERATIONS', 'BRANCH_MANAGER'].includes(r.role)) return false;
    if (!r.siteId && !r.buildingId) return true;
    if (r.buildingId) return r.buildingId === loc.buildingId;
    return r.siteId === loc.siteId;
  });
}

const LINE_ASSET = {
  select: {
    id: true, assetTag: true, description: true, status: true,
    subCategory: { select: { id: true, name: true } },
    room: { select: { id: true, number: true } },
    custodian: { select: { id: true, name: true } },
  },
};

export async function createSession(user, input = {}) {
  const roles = await rolesOf(user.id);
  const admin = isHubAdmin(user, roles);
  if (!admin && !hasAssetRole(roles)) throw new ApiError(403, 'You need an AssetHub role to run verification');

  const { title, mode, siteId, buildingId, roomId, categoryId } = input;
  if (!siteId || !buildingId) throw new ApiError(400, 'Choose a site and building to verify');
  if (!['item', 'count'].includes(mode)) throw new ApiError(400, 'Pick item-based or count-based mode');
  if (!admin && !scopeCovers(roles, { siteId, buildingId })) throw new ApiError(403, 'That location is outside your scope');

  const where = { siteId, buildingId, status: { in: PRESENT } };
  if (roomId) where.roomId = roomId;
  if (categoryId) where.categoryId = categoryId;
  const expected = await prisma.assetRecord.findMany({
    where, orderBy: { assetTag: 'asc' },
    select: { id: true, subCategoryId: true },
  });
  if (!expected.length) throw new ApiError(400, 'No assets in the register match that scope');

  const session = await prisma.verificationSession.create({
    data: {
      title: (title || '').trim() || `Verification — ${new Date().toLocaleDateString('en-IN')}`,
      mode, siteId, buildingId, roomId: roomId || null, categoryId: categoryId || null,
      expectedCount: expected.length, conductedById: user.id,
    },
  });

  if (mode === 'item') {
    await prisma.verificationLine.createMany({ data: expected.map((a) => ({ sessionId: session.id, assetId: a.id })) });
  } else {
    const bySub = new Map();
    for (const a of expected) bySub.set(a.subCategoryId, (bySub.get(a.subCategoryId) || 0) + 1);
    await prisma.verificationCount.createMany({
      data: [...bySub.entries()].map(([subCategoryId, expectedN]) => ({ sessionId: session.id, subCategoryId, expected: expectedN })),
    });
  }
  return getSession(user, session.id);
}

function summarise(session) {
  if (session.mode === 'item') {
    const tally = { pending: 0, found: 0, missing: 0, damaged: 0, wrong_location: 0 };
    for (const l of session.lines) tally[l.result] = (tally[l.result] || 0) + 1;
    const checked = session.lines.length - tally.pending;
    return { ...tally, total: session.lines.length, checked, variance: tally.missing };
  }
  let expected = 0, actual = 0, variance = 0, counted = 0;
  for (const c of session.counts) {
    expected += c.expected;
    if (c.actual != null) { actual += c.actual; variance += c.actual - c.expected; counted += 1; }
  }
  return { expected, actual, variance, rows: session.counts.length, counted };
}

export async function getSession(user, id) {
  const session = await prisma.verificationSession.findUnique({
    where: { id },
    include: {
      conductedBy: { select: { id: true, name: true } },
      lines: { include: { asset: LINE_ASSET }, orderBy: { asset: { assetTag: 'asc' } } },
      counts: { include: { subCategory: { select: { id: true, name: true } } }, orderBy: { subCategory: { name: 'asc' } } },
    },
  });
  if (!session) throw new ApiError(404, 'Verification session not found');
  // resolve site/building/room labels (plain ids on the session)
  const [site, bldg, room, cat] = await Promise.all([
    prisma.assetSite.findUnique({ where: { id: session.siteId }, select: { name: true } }),
    prisma.assetBuilding.findUnique({ where: { id: session.buildingId }, select: { name: true } }),
    session.roomId ? prisma.assetRoom.findUnique({ where: { id: session.roomId }, select: { number: true } }) : null,
    session.categoryId ? prisma.assetCategory.findUnique({ where: { id: session.categoryId }, select: { name: true } }) : null,
  ]);
  return {
    ...session,
    siteName: site?.name, buildingName: bldg?.name, roomNumber: room?.number || null, categoryName: cat?.name || null,
    summary: summarise(session),
  };
}

export async function listSessions(user) {
  const roles = await rolesOf(user.id);
  const rows = await prisma.verificationSession.findMany({
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { conductedBy: { select: { id: true, name: true } }, lines: { select: { result: true } }, counts: { select: { expected: true, actual: true } } },
  });
  // Lightweight buildings map for labels.
  const bIds = [...new Set(rows.map((r) => r.buildingId))];
  const blds = bIds.length ? await prisma.assetBuilding.findMany({ where: { id: { in: bIds } }, select: { id: true, name: true } }) : [];
  const bMap = new Map(blds.map((b) => [b.id, b.name]));
  return rows.map((s) => ({
    id: s.id, title: s.title, mode: s.mode, status: s.status, createdAt: s.createdAt, closedAt: s.closedAt,
    buildingName: bMap.get(s.buildingId), conductedBy: s.conductedBy, expectedCount: s.expectedCount,
    summary: summarise(s),
  }));
}

async function assertConductor(user, session) {
  const roles = await rolesOf(user.id);
  if (session.conductedById !== user.id && !isHubAdmin(user, roles)) {
    throw new ApiError(403, 'Only the person running this verification (or an admin) can update it');
  }
}

export async function markLine(user, sessionId, lineId, { result, note }) {
  const session = await prisma.verificationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');
  if (session.status !== 'open') throw new ApiError(400, 'This verification is closed');
  await assertConductor(user, session);
  if (!['pending', 'found', 'missing', 'damaged', 'wrong_location'].includes(result)) throw new ApiError(400, 'Invalid result');
  const line = await prisma.verificationLine.findUnique({ where: { id: lineId } });
  if (!line || line.sessionId !== sessionId) throw new ApiError(404, 'Line not found');
  await prisma.verificationLine.update({ where: { id: lineId }, data: { result, note: note ?? line.note } });
  return getSession(user, sessionId);
}

export async function setCount(user, sessionId, countId, actual) {
  const session = await prisma.verificationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');
  if (session.status !== 'open') throw new ApiError(400, 'This verification is closed');
  await assertConductor(user, session);
  const n = actual === '' || actual == null ? null : parseInt(actual, 10);
  if (n != null && (Number.isNaN(n) || n < 0)) throw new ApiError(400, 'Count must be a non-negative number');
  const count = await prisma.verificationCount.findUnique({ where: { id: countId } });
  if (!count || count.sessionId !== sessionId) throw new ApiError(404, 'Count row not found');
  await prisma.verificationCount.update({ where: { id: countId }, data: { actual: n } });
  return getSession(user, sessionId);
}

// Variance → write-off / damage routing: raise the matching lifecycle event on the flagged asset.
export async function resolveLine(user, sessionId, lineId) {
  const session = await prisma.verificationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');
  await assertConductor(user, session);
  const line = await prisma.verificationLine.findUnique({ where: { id: lineId } });
  if (!line || line.sessionId !== sessionId) throw new ApiError(404, 'Line not found');
  if (line.resolved) throw new ApiError(400, 'A follow-up has already been raised for this asset');

  const map = { missing: 'write_off', damaged: 'damage' };
  const type = map[line.result];
  if (!type) throw new ApiError(400, 'Only missing or damaged items can be routed to a follow-up');
  await raiseEvent(user, line.assetId, { type, reason: `Flagged during verification: ${session.title}` });
  await prisma.verificationLine.update({ where: { id: lineId }, data: { resolved: true } });
  return getSession(user, sessionId);
}

export async function closeSession(user, sessionId) {
  const session = await prisma.verificationSession.findUnique({ where: { id: sessionId }, include: { lines: true } });
  if (!session) throw new ApiError(404, 'Session not found');
  if (session.status !== 'open') throw new ApiError(400, 'Already closed');
  await assertConductor(user, session);
  // item mode: any unchecked line is treated as missing at close-out.
  if (session.mode === 'item') {
    const pending = session.lines.filter((l) => l.result === 'pending');
    if (pending.length) {
      await prisma.verificationLine.updateMany({ where: { sessionId, result: 'pending' }, data: { result: 'missing' } });
    }
  }
  await prisma.verificationSession.update({ where: { id: sessionId }, data: { status: 'closed', closedAt: new Date() } });
  return getSession(user, sessionId);
}
