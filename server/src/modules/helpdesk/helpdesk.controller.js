import * as service from './helpdesk.service.js';
import { canHelpdesk } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const requireAgent = (req) => { if (!canHelpdesk(req.user)) throw new ApiError(403, 'Helpdesk agent access required'); };

export function getAccess(req, res) {
  res.json({
    data: {
      canHelpdesk: canHelpdesk(req.user),
      categories: service.CATEGORIES,
      // The categories this agent's queue covers (null = all, for the CEO).
      handles: service.allowedCategories(req.user),
    },
    error: null,
  });
}

export async function getMine(req, res, next) {
  try { res.json({ data: await service.listMine(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function getQueue(req, res, next) {
  try { requireAgent(req); res.json({ data: await service.listQueue(req.user), error: null }); }
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
    res.json({ data: await service.assign(req.user, req.params.id, assigneeId), error: null });
  } catch (e) { next(e); }
}

export async function setStatus(req, res, next) {
  try {
    requireAgent(req);
    res.json({ data: await service.setStatus(req.user, req.params.id, req.params.status), error: null });
  } catch (e) { next(e); }
}

// Detail + the comment thread. Access (raiser or agent) is enforced in the service.
export async function get(req, res, next) {
  try { res.json({ data: await service.get(req.user, req.params.id), error: null }); }
  catch (e) { next(e); }
}

export async function addComment(req, res, next) {
  try { res.json({ data: await service.addComment(req.user, req.params.id, req.body?.body), error: null }); }
  catch (e) { next(e); }
}

export async function markRead(req, res, next) {
  try { res.json({ data: await service.markRead(req.user, req.params.id), error: null }); }
  catch (e) { next(e); }
}
