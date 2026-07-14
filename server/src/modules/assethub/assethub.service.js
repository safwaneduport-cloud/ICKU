import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { canAdmin } from '../../lib/access.js';

export const ASSET_ROLES = [
  'OPERATIONS', 'BRANCH_MANAGER', 'FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO', 'ASSET_ADMIN',
];

// ── access ───────────────────────────────────────────────────────────
export async function myAccess(user) {
  const roles = await prisma.assetRoleAssignment.findMany({
    where: { userId: user.id },
    select: { role: true, siteId: true, buildingId: true },
  });
  const isAssetAdmin = canAdmin(user) || roles.some((r) => r.role === 'ASSET_ADMIN');
  return { roles, isAssetAdmin, allRoles: ASSET_ROLES };
}

export async function assertAssetAdmin(user) {
  const { isAssetAdmin } = await myAccess(user);
  if (!isAssetAdmin) throw new ApiError(403, 'Only the AssetHub admin can manage master data');
}

// ── masters (one payload for Setup + form dropdowns) ─────────────────
export async function allMasters() {
  const [categories, sites, vendors, glCodes, bands] = await Promise.all([
    prisma.assetCategory.findMany({
      orderBy: { code: 'asc' },
      include: {
        defaultGlCode: { select: { id: true, code: true, name: true } },
        subCategories: { orderBy: { code: 'asc' } },
      },
    }),
    prisma.assetSite.findMany({
      orderBy: { name: 'asc' },
      include: { buildings: { orderBy: { code: 'asc' }, include: { rooms: { orderBy: { number: 'asc' } } } } },
    }),
    prisma.assetVendor.findMany({ orderBy: { name: 'asc' } }),
    prisma.glCode.findMany({ orderBy: { code: 'asc' } }),
    prisma.assetApprovalBand.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  return { categories, sites, vendors, glCodes, bands };
}

const dup409 = (e, what) => {
  if (e?.code === 'P2002') throw new ApiError(409, `That ${what} already exists`);
  throw e;
};

// ── categories & sub-categories ──────────────────────────────────────
export async function createCategory({ code, name, defaultGlCodeId }) {
  if (!code?.trim() || !name?.trim()) throw new ApiError(400, 'Code and name are required');
  return prisma.assetCategory
    .create({ data: { code: code.trim().toUpperCase(), name: name.trim(), defaultGlCodeId: defaultGlCodeId || null } })
    .catch((e) => dup409(e, 'category code'));
}

export async function updateCategory(id, { name, defaultGlCodeId, active }) {
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (defaultGlCodeId !== undefined) data.defaultGlCodeId = defaultGlCodeId || null;
  if (active !== undefined) data.active = !!active;
  return prisma.assetCategory.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'Category not found'); });
}

export async function createSubCategory({ categoryId, code, name, defaultGstRate, defaultItcEligible, itcBlockReason }) {
  if (!categoryId || !code?.trim() || !name?.trim()) throw new ApiError(400, 'Category, code and name are required');
  return prisma.assetSubCategory
    .create({
      data: {
        categoryId, code: code.trim().toUpperCase(), name: name.trim(),
        defaultGstRate: defaultGstRate ?? 18,
        defaultItcEligible: defaultItcEligible ?? true,
        itcBlockReason: itcBlockReason || null,
      },
    })
    .catch((e) => dup409(e, 'sub-category code'));
}

export async function updateSubCategory(id, patch) {
  const data = {};
  for (const k of ['name', 'itcBlockReason']) if (patch[k] !== undefined) data[k] = patch[k]?.trim() || null;
  if (patch.name !== undefined && !data.name) throw new ApiError(400, 'Name cannot be empty');
  if (patch.defaultGstRate !== undefined) data.defaultGstRate = Number(patch.defaultGstRate) || 0;
  if (patch.defaultItcEligible !== undefined) data.defaultItcEligible = !!patch.defaultItcEligible;
  if (patch.active !== undefined) data.active = !!patch.active;
  return prisma.assetSubCategory.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'Sub-category not found'); });
}

// ── locations ────────────────────────────────────────────────────────
export async function createSite({ code, name }) {
  if (!code?.trim() || !name?.trim()) throw new ApiError(400, 'Code and name are required');
  return prisma.assetSite
    .create({ data: { code: code.trim().toUpperCase(), name: name.trim() } })
    .catch((e) => dup409(e, 'site code'));
}

export async function updateSite(id, { name, active }) {
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (active !== undefined) data.active = !!active;
  return prisma.assetSite.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'Site not found'); });
}

export async function createBuilding({ siteId, code, name }) {
  if (!siteId || !code?.trim() || !name?.trim()) throw new ApiError(400, 'Site, code and name are required');
  return prisma.assetBuilding
    .create({ data: { siteId, code: code.trim().toUpperCase(), name: name.trim() } })
    .catch((e) => dup409(e, 'building code'));
}

export async function updateBuilding(id, { name, active }) {
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (active !== undefined) data.active = !!active;
  return prisma.assetBuilding.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'Building not found'); });
}

// Accepts explicit numbers and/or ranges: ["101","102"] or "101-110, 201"
export function expandRoomNumbers(input) {
  const parts = Array.isArray(input) ? input : String(input || '').split(',');
  const out = [];
  for (const raw of parts) {
    const p = String(raw).trim();
    if (!p) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (m) {
      const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
      if (b < a || b - a > 500) throw new ApiError(400, `Bad room range: ${p}`);
      for (let n = a; n <= b; n++) out.push(String(n));
    } else out.push(p);
  }
  return [...new Set(out)];
}

export async function addRooms({ buildingId, numbers }) {
  if (!buildingId) throw new ApiError(400, 'Building is required');
  const list = expandRoomNumbers(numbers);
  if (!list.length) throw new ApiError(400, 'No room numbers given');
  await prisma.assetRoom.createMany({
    data: list.map((number) => ({ buildingId, number })),
    skipDuplicates: true,
  });
  return prisma.assetRoom.findMany({ where: { buildingId }, orderBy: { number: 'asc' } });
}

export async function updateRoom(id, { active }) {
  return prisma.assetRoom.update({ where: { id }, data: { active: !!active } }).catch(() => { throw new ApiError(404, 'Room not found'); });
}

// ── vendors ──────────────────────────────────────────────────────────
export async function createVendor({ name, gstin, pan, contact }) {
  if (!name?.trim()) throw new ApiError(400, 'Vendor name is required');
  const n = await prisma.assetVendor.count();
  return prisma.assetVendor.create({
    data: {
      code: `VEN-${String(n + 1).padStart(4, '0')}`,
      name: name.trim(), gstin: gstin?.trim() || null, pan: pan?.trim() || null, contact: contact?.trim() || null,
    },
  });
}

export async function updateVendor(id, patch) {
  const data = {};
  for (const k of ['name', 'gstin', 'pan', 'contact']) if (patch[k] !== undefined) data[k] = patch[k]?.trim() || null;
  if (patch.name !== undefined && !data.name) throw new ApiError(400, 'Name cannot be empty');
  if (patch.active !== undefined) data.active = !!patch.active;
  return prisma.assetVendor.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'Vendor not found'); });
}

// ── GL codes ─────────────────────────────────────────────────────────
export async function createGlCode({ code, name }) {
  if (!code?.trim() || !name?.trim()) throw new ApiError(400, 'Code and name are required');
  return prisma.glCode
    .create({ data: { code: code.trim().toUpperCase(), name: name.trim() } })
    .catch((e) => dup409(e, 'GL code'));
}

export async function updateGlCode(id, { name, active }) {
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (active !== undefined) data.active = !!active;
  return prisma.glCode.update({ where: { id }, data }).catch(() => { throw new ApiError(404, 'GL code not found'); });
}

// ── approval matrix (full replace — small list, simplest to edit) ────
export async function replaceBands(bands) {
  if (!Array.isArray(bands) || !bands.length) throw new ApiError(400, 'At least one band is required');
  const clean = bands.map((b, i) => {
    const approvers = (b.approvers || []).filter((r) => ASSET_ROLES.includes(r));
    if (!approvers.length) throw new ApiError(400, `Band ${i + 1} needs at least one approver role`);
    return {
      minValue: Number(b.minValue) || 0,
      maxValue: b.maxValue == null || b.maxValue === '' ? null : Number(b.maxValue),
      approvers, label: b.label?.trim() || null, sort: i,
    };
  });
  await prisma.$transaction([
    prisma.assetApprovalBand.deleteMany(),
    prisma.assetApprovalBand.createMany({ data: clean }),
  ]);
  return prisma.assetApprovalBand.findMany({ orderBy: { sort: 'asc' } });
}

// ── role assignments ─────────────────────────────────────────────────
export async function listRoles() {
  const rows = await prisma.assetRoleAssignment.findMany({
    include: { user: { select: { id: true, name: true, designation: true } } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  const [sites, buildings] = await Promise.all([
    prisma.assetSite.findMany({ select: { id: true, name: true } }),
    prisma.assetBuilding.findMany({ select: { id: true, name: true } }),
  ]);
  const siteName = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const bldgName = Object.fromEntries(buildings.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    id: r.id, role: r.role,
    user: r.user,
    siteId: r.siteId, siteName: r.siteId ? siteName[r.siteId] || '?' : null,
    buildingId: r.buildingId, buildingName: r.buildingId ? bldgName[r.buildingId] || '?' : null,
  }));
}

export async function addRole({ userId, role, siteId, buildingId }) {
  if (!userId || !ASSET_ROLES.includes(role)) throw new ApiError(400, 'A person and a valid role are required');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ApiError(404, 'Employee not found');
  const dup = await prisma.assetRoleAssignment.findFirst({
    where: { userId, role, siteId: siteId || null, buildingId: buildingId || null },
  });
  if (dup) throw new ApiError(409, 'That assignment already exists');
  return prisma.assetRoleAssignment.create({
    data: { userId, role, siteId: siteId || null, buildingId: buildingId || null },
  });
}

export async function removeRole(id) {
  await prisma.assetRoleAssignment.delete({ where: { id } }).catch(() => { throw new ApiError(404, 'Assignment not found'); });
  return { ok: true };
}
