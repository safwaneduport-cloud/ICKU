import * as service from './assets.service.js';
import { canAssets } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const requireAdmin = (req) => { if (!canAssets(req.user)) throw new ApiError(403, 'Asset admin access required'); };

export function getAccess(req, res) {
  res.json({ data: { canAssets: canAssets(req.user) }, error: null });
}

export async function getMine(req, res, next) {
  try { res.json({ data: await service.listMine(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function getAll(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.listAll(), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    requireAdmin(req);
    const { type, tag, warranty } = req.body || {};
    if (!type || !tag?.trim()) throw new ApiError(400, 'Type and tag are required');
    res.json({ data: await service.create({ type, tag: tag.trim(), warranty }), error: null });
  } catch (e) { next(e); }
}

export async function assign(req, res, next) {
  try {
    requireAdmin(req);
    const { userId } = req.body || {};
    const data = userId ? await service.assign(req.params.id, userId) : await service.returnToStock(req.params.id);
    res.json({ data, error: null });
  } catch (e) { next(e); }
}

export async function returnToStock(req, res, next) {
  try { requireAdmin(req); res.json({ data: await service.returnToStock(req.params.id), error: null }); }
  catch (e) { next(e); }
}
