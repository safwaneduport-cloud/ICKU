import * as service from './credentials.service.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const ok = (res, data) => res.json({ data, error: null });
function assertHr(req) {
  if (!canAdmin(req.user)) throw new ApiError(403, 'Only HR/Admin can view login credentials');
}

export async function list(req, res, next) {
  try { assertHr(req); ok(res, await service.list()); } catch (e) { next(e); }
}

export async function resetPassword(req, res, next) {
  try { assertHr(req); ok(res, await service.resetPassword(req.params.userId, req.body?.password)); } catch (e) { next(e); }
}

export async function updateUsername(req, res, next) {
  try { assertHr(req); ok(res, await service.updateUsername(req.params.userId, req.body?.username)); } catch (e) { next(e); }
}

// self-service — any authenticated user changes their own password
export async function changeOwnPassword(req, res, next) {
  try { ok(res, await service.changeOwnPassword(req.user.id, req.body?.currentPassword, req.body?.newPassword)); } catch (e) { next(e); }
}
