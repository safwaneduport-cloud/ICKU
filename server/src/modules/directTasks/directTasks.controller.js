import * as service from './directTasks.service.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function mine(req, res, next) {
  try { res.json({ data: await service.listForUser(req.user.id), error: null }); } catch (e) { next(e); }
}
export async function assigned(req, res, next) {
  try { res.json({ data: await service.listAssignedBy(req.user.id), error: null }); } catch (e) { next(e); }
}
export async function approvals(req, res, next) {
  try { res.json({ data: await service.pendingApprovals(req.user.id), error: null }); } catch (e) { next(e); }
}
export async function forReport(req, res, next) {
  try {
    const t = req.params.userId;
    if (t !== req.user.id && !canAdmin(req.user) && !(await isManagerOf(req.user.id, t))) throw new ApiError(403, 'Only their manager can view this');
    res.json({ data: await service.listForUser(t), error: null });
  } catch (e) { next(e); }
}
export async function create(req, res, next) {
  try { res.json({ data: await service.create(req.user, req.body || {}), error: null }); } catch (e) { next(e); }
}
export async function toggle(req, res, next) {
  try { res.json({ data: await service.toggleComplete(req.user, req.params.id), error: null }); } catch (e) { next(e); }
}
export async function decide(req, res, next) {
  try { res.json({ data: await service.decide(req.user, req.params.id, req.params.decision), error: null }); } catch (e) { next(e); }
}
export async function rejectAssignment(req, res, next) {
  try { res.json({ data: await service.rejectAssignment(req.user, req.params.id, req.body || {}), error: null }); } catch (e) { next(e); }
}
export async function remove(req, res, next) {
  try { res.json({ data: await service.remove(req.user, req.params.id), error: null }); } catch (e) { next(e); }
}
