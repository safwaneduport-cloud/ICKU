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
