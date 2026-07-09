import * as service from './onboarding.service.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

// Onboarding is an HR function — gated to admins (CEO / HR Head).
const requireHr = (req) => { if (!canAdmin(req.user)) throw new ApiError(403, 'HR access required'); };

export function getAccess(req, res) {
  res.json({ data: { canManage: canAdmin(req.user), checklist: service.ONB_CHECKLIST }, error: null });
}

export async function list(req, res, next) {
  try { requireHr(req); res.json({ data: await service.list(), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    requireHr(req);
    const { name, designation, departmentId, joinDate } = req.body || {};
    if (!name?.trim() || !joinDate) throw new ApiError(400, 'Name and join date are required');
    res.json({ data: await service.create({ name: name.trim(), designation: designation?.trim(), departmentId, joinDate }), error: null });
  } catch (e) { next(e); }
}

export async function toggleItem(req, res, next) {
  try {
    requireHr(req);
    res.json({ data: await service.toggleItem(req.params.id, req.body?.item), error: null });
  } catch (e) { next(e); }
}
