import * as service from './exit.service.js';
import { canAdmin } from '../../lib/access.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { ApiError } from '../../middleware/errorHandler.js';

export function getMeta(req, res) {
  res.json({ data: { clearanceSteps: service.CLEARANCE_STEPS, isAdmin: canAdmin(req.user) }, error: null });
}

export async function getMine(req, res, next) {
  try { res.json({ data: await service.getMine(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function getTeam(req, res, next) {
  try { res.json({ data: await service.listTeam(req.user.id, canAdmin(req.user)), error: null }); }
  catch (e) { next(e); }
}

export async function submit(req, res, next) {
  try {
    const { lastDay, reason } = req.body || {};
    if (!lastDay || !reason?.trim()) throw new ApiError(400, 'Last day and reason are required');
    res.json({ data: await service.submit(req.user.id, lastDay, reason.trim()), error: null });
  } catch (e) { next(e); }
}

export async function withdraw(req, res, next) {
  try { res.json({ data: await service.withdraw(req.user.id, req.params.id), error: null }); }
  catch (e) { next(e); }
}

// Clearance & exit-interview can be actioned by the person's manager or an admin.
async function requireProcessor(req) {
  const e = await service.getExitRaw(req.params.id);
  if (!e) throw new ApiError(404, 'Resignation not found');
  if (!canAdmin(req.user) && !(await isManagerOf(req.user.id, e.userId))) {
    throw new ApiError(403, 'Only the reporting manager or HR can process this');
  }
}

export async function toggleClearance(req, res, next) {
  try {
    await requireProcessor(req);
    res.json({ data: await service.toggleClearance(req.params.id, req.body?.step), error: null });
  } catch (e) { next(e); }
}

export async function setInterview(req, res, next) {
  try {
    await requireProcessor(req);
    res.json({ data: await service.setInterview(req.params.id, req.body?.value), error: null });
  } catch (e) { next(e); }
}
