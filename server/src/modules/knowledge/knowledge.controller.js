import * as service from './knowledge.service.js';
import { ApiError } from '../../middleware/errorHandler.js';

const canCreate = (user) => user?.tier !== 'Employee';

export function getMeta(req, res) {
  res.json({ data: { types: service.KTYPES, canCreate: canCreate(req.user) }, error: null });
}

export async function list(req, res, next) {
  try {
    res.json({ data: await service.list({ type: req.query.type, dept: req.query.dept, q: req.query.q }), error: null });
  } catch (e) { next(e); }
}

export async function get(req, res, next) {
  try { res.json({ data: await service.get(req.params.id), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    if (!canCreate(req.user)) throw new ApiError(403, 'You do not have permission to create documents');
    res.json({ data: await service.create(req.user.id, req.body || {}), error: null });
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try { res.json({ data: await service.update(req.params.id, req.user, req.body || {}), error: null }); }
  catch (e) { next(e); }
}
