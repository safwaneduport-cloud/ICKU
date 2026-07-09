import * as service from './helpdesk.service.js';
import { canHelpdesk } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const requireAgent = (req) => { if (!canHelpdesk(req.user)) throw new ApiError(403, 'Helpdesk agent access required'); };

export function getAccess(req, res) {
  res.json({ data: { canHelpdesk: canHelpdesk(req.user) }, error: null });
}

export async function getMine(req, res, next) {
  try { res.json({ data: await service.listMine(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function getQueue(req, res, next) {
  try { requireAgent(req); res.json({ data: await service.listQueue(), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const { category, subject } = req.body || {};
    if (!category || !subject?.trim()) throw new ApiError(400, 'Category and subject are required');
    res.json({ data: await service.create(req.user.id, { category, subject: subject.trim() }), error: null });
  } catch (e) { next(e); }
}

export async function assign(req, res, next) {
  try {
    requireAgent(req);
    const assigneeId = req.body?.assigneeId || req.user.id;
    res.json({ data: await service.assign(req.params.id, assigneeId), error: null });
  } catch (e) { next(e); }
}

export async function setStatus(req, res, next) {
  try {
    requireAgent(req);
    res.json({ data: await service.setStatus(req.params.id, req.params.status), error: null });
  } catch (e) { next(e); }
}
