import * as service from './admin.service.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const requireAdmin = (req) => { if (!canAdmin(req.user)) throw new ApiError(403, 'Admin Console access required'); };

export function getAccess(req, res) {
  res.json({ data: { canAdmin: canAdmin(req.user) }, error: null });
}

// ── Users ──
export async function listUsers(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.listUsers(), error: null }); }
  catch (e) { next(e); }
}
export async function createUser(req, res, next) {
  try {
    requireAdmin(req);
    if (!req.body?.name?.trim()) throw new ApiError(400, 'Name is required');
    const u = await service.createUser(req.body);
    await service.log(req.user.id, `created user ${u.name}`);
    res.json({ data: u, error: null });
  } catch (e) { next(e); }
}
export async function updateUser(req, res, next) {
  try {
    requireAdmin(req);
    const u = await service.updateUser(req.params.id, req.body || {});
    await service.log(req.user.id, `updated user ${u.name}`);
    res.json({ data: u, error: null });
  } catch (e) { next(e); }
}

// ── Departments ──
export async function listDepartments(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.listDepartments(), error: null }); }
  catch (e) { next(e); }
}
export async function createDepartment(req, res, next) {
  try {
    requireAdmin(req);
    if (!req.body?.name?.trim()) throw new ApiError(400, 'Name is required');
    const d = await service.createDepartment(req.body);
    await service.log(req.user.id, `created department ${d.name}`);
    res.json({ data: d, error: null });
  } catch (e) { next(e); }
}
export async function updateDepartment(req, res, next) {
  try {
    requireAdmin(req);
    const d = await service.updateDepartment(req.params.id, req.body || {});
    await service.log(req.user.id, `updated department ${d.name}`);
    res.json({ data: d, error: null });
  } catch (e) { next(e); }
}

// ── RBAC matrix ──
export async function getMatrix(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.getMatrix(), error: null }); }
  catch (e) { next(e); }
}
export async function setCapability(req, res, next) {
  try {
    requireAdmin(req);
    const { tier, capability, enabled } = req.body || {};
    const grid = await service.setCapability(tier, capability, !!enabled);
    await service.log(req.user.id, `${enabled ? 'granted' : 'revoked'} ${capability} for ${tier}`);
    res.json({ data: grid, error: null });
  } catch (e) { next(e); }
}

// ── Settings ──
export async function listSettings(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.listSettings(), error: null }); }
  catch (e) { next(e); }
}
export async function toggleSetting(req, res, next) {
  try {
    requireAdmin(req);
    const s = await service.toggleSetting(req.params.key);
    await service.log(req.user.id, `${s.enabled ? 'enabled' : 'disabled'} ${s.label}`);
    res.json({ data: s, error: null });
  } catch (e) { next(e); }
}

// ── Audit ──
export async function listAudit(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.listAudit(), error: null }); }
  catch (e) { next(e); }
}
