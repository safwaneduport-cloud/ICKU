import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { TIERS, CAPABILITIES } from '../../lib/rbac.js';

const userSelect = {
  id: true, name: true, email: true, role: true, tier: true,
  designation: true, status: true, departmentId: true, reportsToId: true,
};

export const log = (actorId, action) => prisma.auditLog.create({ data: { actorId, action } });

// ── Users ──
export const listUsers = () => prisma.user.findMany({ orderBy: { name: 'asc' }, select: userSelect });

async function uniqueId(base) {
  let id = base || 'user';
  let n = 1;
  while (await prisma.user.findUnique({ where: { id } })) id = `${base}-${n++}`;
  return id;
}

export async function createUser(data) {
  const base = (data.name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  const id = await uniqueId(base);
  return prisma.user.create({
    data: {
      id,
      name: data.name,
      email: data.email || null,
      designation: data.designation || '—',
      role: data.role || data.designation || data.name,
      tier: data.tier || 'Employee',
      departmentId: data.departmentId || null,
      reportsToId: data.reportsToId || null,
      status: 'active',
    },
    select: userSelect,
  });
}

export async function updateUser(id, data) {
  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) throw new ApiError(404, 'User not found');
  return prisma.user.update({
    where: { id },
    data: {
      name: data.name ?? undefined,
      email: data.email ?? undefined,
      designation: data.designation ?? undefined,
      role: data.role ?? undefined,
      tier: data.tier ?? undefined,
      departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
      reportsToId: data.reportsToId === undefined ? undefined : data.reportsToId || null,
      status: data.status ?? undefined,
    },
    select: userSelect,
  });
}

// ── Departments ──
export const listDepartments = () =>
  prisma.department.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } });

export async function createDepartment({ id, name, color }) {
  const slug = (id || name || 'dept').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (await prisma.department.findUnique({ where: { id: slug } })) throw new ApiError(409, 'Department id already exists');
  return prisma.department.create({ data: { id: slug, name, color: color || '#134535' } });
}

export async function updateDepartment(id, { name, color }) {
  const exists = await prisma.department.findUnique({ where: { id } });
  if (!exists) throw new ApiError(404, 'Department not found');
  return prisma.department.update({ where: { id }, data: { name: name ?? undefined, color: color ?? undefined } });
}

// ── RBAC matrix ──
export async function getMatrix() {
  const rows = await prisma.tierCapability.findMany();
  const granted = new Set(rows.map((r) => `${r.tier}::${r.capability}`));
  const grid = {};
  for (const tier of TIERS) {
    grid[tier] = {};
    for (const cap of CAPABILITIES) grid[tier][cap.id] = granted.has(`${tier}::${cap.id}`);
  }
  return { tiers: TIERS, capabilities: CAPABILITIES, grid };
}

export async function setCapability(tier, capability, enabled) {
  if (!TIERS.includes(tier) || !CAPABILITIES.some((c) => c.id === capability)) throw new ApiError(400, 'Unknown tier or capability');
  if (enabled) {
    await prisma.tierCapability.upsert({ where: { tier_capability: { tier, capability } }, update: {}, create: { tier, capability } });
  } else {
    await prisma.tierCapability.deleteMany({ where: { tier, capability } });
  }
  return getMatrix();
}

// ── Settings ──
export const listSettings = () => prisma.setting.findMany({ orderBy: [{ category: 'asc' }, { sort: 'asc' }] });

export async function toggleSetting(key) {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) throw new ApiError(404, 'Setting not found');
  return prisma.setting.update({ where: { key }, data: { enabled: !s.enabled } });
}

// ── Audit ──
export const listAudit = () =>
  prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
