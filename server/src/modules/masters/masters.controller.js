import * as service from './masters.service.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const ok = (res, data) => res.json({ data, error: null });
function assertHr(req) {
  if (!canAdmin(req.user)) throw new ApiError(403, 'Only HR/Admin can manage master data');
}

// Any authenticated user may read active options (for form dropdowns).
export async function getActiveOptions(req, res, next) {
  try { ok(res, await service.activeOptions(req.params.type)); } catch (e) { next(e); }
}

export async function getTypes(req, res, next) {
  try { assertHr(req); ok(res, await service.listTypes()); } catch (e) { next(e); }
}

export async function getAdminOptions(req, res, next) {
  try { assertHr(req); ok(res, await service.adminOptions(req.params.type, req.query.q)); } catch (e) { next(e); }
}

export async function create(req, res, next) {
  try { assertHr(req); ok(res, await service.createOption(req.params.type, req.body?.value)); } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try { assertHr(req); ok(res, await service.updateOption(req.params.id, req.body || {})); } catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try { assertHr(req); ok(res, await service.removeOption(req.params.id)); } catch (e) { next(e); }
}
