import * as service from './announcements.service.js';
import { ApiError } from '../../middleware/errorHandler.js';

const canPost = (user) => user?.tier !== 'Employee';

export function getMeta(req, res) {
  res.json({ data: { scopes: service.SCOPES, canPost: canPost(req.user) }, error: null });
}

export async function list(req, res, next) {
  try { res.json({ data: await service.list(req.user.id, req.query.scope), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    if (!canPost(req.user)) throw new ApiError(403, 'You do not have permission to post announcements');
    res.json({ data: await service.create(req.user.id, req.body || {}), error: null });
  } catch (e) { next(e); }
}

export async function ack(req, res, next) {
  try { res.json({ data: await service.toggleAck(req.params.id, req.user.id), error: null }); }
  catch (e) { next(e); }
}
