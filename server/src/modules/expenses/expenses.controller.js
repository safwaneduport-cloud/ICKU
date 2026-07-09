import * as service from './expenses.service.js';
import { canPayroll } from '../../lib/access.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function getMine(req, res, next) {
  try { res.json({ data: await service.listMine(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const { category, amount, date, description, receiptUrl } = req.body || {};
    if (!category || !amount || !date || !description?.trim()) {
      throw new ApiError(400, 'Category, amount, date and description are required');
    }
    const data = await service.create(req.user.id, { category, amount, date, description: description.trim(), receiptUrl });
    res.json({ data, error: null });
  } catch (e) { next(e); }
}

export async function cancel(req, res, next) {
  try { res.json({ data: await service.cancel(req.user.id, req.params.id), error: null }); }
  catch (e) { next(e); }
}

export async function managerQueue(req, res, next) {
  try { res.json({ data: await service.managerQueue(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function financeQueue(req, res, next) {
  try {
    if (!canPayroll(req.user)) throw new ApiError(403, 'Finance access required');
    res.json({ data: await service.financeQueue(), error: null });
  } catch (e) { next(e); }
}

// Stage-aware authorization: manager stage → the employee's manager;
// finance/payment stages → a finance admin.
async function authorizeAction(req) {
  const e = await service.get(req.params.id);
  if (!e) throw new ApiError(404, 'Claim not found');
  if (e.status === 'manager') {
    if (!(await isManagerOf(req.user.id, e.userId))) throw new ApiError(403, 'Only the reporting manager can action this');
  } else if (['finance', 'payment'].includes(e.status)) {
    if (!canPayroll(req.user)) throw new ApiError(403, 'Finance access required');
  } else {
    throw new ApiError(409, 'Claim is not actionable');
  }
  return e;
}

export async function approve(req, res, next) {
  try {
    await authorizeAction(req);
    res.json({ data: await service.advance(req.params.id), error: null });
  } catch (e) { next(e); }
}

export async function reject(req, res, next) {
  try {
    await authorizeAction(req);
    res.json({ data: await service.reject(req.params.id, req.user.id), error: null });
  } catch (e) { next(e); }
}
