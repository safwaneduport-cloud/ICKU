import * as service from './employees.service.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const ok = (res, data) => res.json({ data, error: null });
function assertHr(req) {
  if (!canAdmin(req.user)) throw new ApiError(403, 'Only HR/Admin can create employees');
}

export async function onboard(req, res, next) {
  try { assertHr(req); ok(res, await service.onboard(req.body || {})); } catch (e) { next(e); }
}

export async function getMyProfile(req, res, next) {
  try { ok(res, await service.getProfile(req.user.id)); } catch (e) { next(e); }
}

export async function getProfile(req, res, next) {
  try {
    if (!canAdmin(req.user) && req.user.id !== req.params.id) throw new ApiError(403, 'Not permitted');
    ok(res, await service.getProfile(req.params.id));
  } catch (e) { next(e); }
}

export async function updateProfile(req, res, next) {
  try { ok(res, await service.updateProfile(req.user, req.params.id, req.body || {})); } catch (e) { next(e); }
}
