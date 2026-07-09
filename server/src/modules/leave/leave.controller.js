import * as service from './leave.service.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function getTypes(req, res, next) {
  try {
    res.json({ data: await service.listTypes(), error: null });
  } catch (e) { next(e); }
}

export async function getBalances(req, res, next) {
  try {
    const targetId = req.query.userId || req.user.id;
    if (targetId !== req.user.id && !(await isManagerOf(req.user.id, targetId))) {
      throw new ApiError(403, 'Not permitted to view this user’s balances');
    }
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json({ data: await service.getBalances(targetId, year), error: null });
  } catch (e) { next(e); }
}

export async function getMyRequests(req, res, next) {
  try {
    res.json({ data: await service.listMyRequests(req.user.id), error: null });
  } catch (e) { next(e); }
}

export async function createRequest(req, res, next) {
  try {
    const { typeId, from, to, half, reason } = req.body || {};
    if (!typeId || !from || !reason?.trim()) throw new ApiError(400, 'Type, start date and reason are required');
    const data = await service.createRequest(req.user.id, typeId, from, to || from, !!half, reason.trim());
    res.json({ data, error: null });
  } catch (e) { next(e); }
}

export async function cancelRequest(req, res, next) {
  try {
    res.json({ data: await service.cancelRequest(req.user.id, req.params.id), error: null });
  } catch (e) { next(e); }
}

export async function getTeam(req, res, next) {
  try {
    res.json({ data: await service.listTeam(req.user.id), error: null });
  } catch (e) { next(e); }
}

export async function reviewRequest(req, res, next) {
  try {
    const decision = req.params.decision === 'approve' ? 'approved' : 'rejected';
    const team = await service.listTeam(req.user.id);
    if (!team.find((r) => r.id === req.params.id)) {
      throw new ApiError(403, 'You can only review your team’s leave requests');
    }
    res.json({ data: await service.review(req.params.id, req.user.id, decision), error: null });
  } catch (e) { next(e); }
}
