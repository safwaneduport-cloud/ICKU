import * as service from './attendance.service.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { ApiError } from '../../middleware/errorHandler.js';

const now = () => new Date();
const defYear = (q) => Number(q.year) || now().getFullYear();
const defMonth = (q) => Number(q.month) || now().getMonth() + 1;

// GET /attendance?userId=&year=&month=  (self, or a report if you manage them)
export async function getAttendance(req, res, next) {
  try {
    const targetId = req.query.userId || req.user.id;
    if (targetId !== req.user.id && !(await isManagerOf(req.user.id, targetId))) {
      throw new ApiError(403, 'Not permitted to view this user’s attendance');
    }
    const data = await service.getMonth(targetId, defYear(req.query), defMonth(req.query));
    res.json({ data, error: null });
  } catch (e) {
    next(e);
  }
}

export async function getToday(req, res, next) {
  try {
    res.json({ data: await service.getToday(req.user.id), error: null });
  } catch (e) {
    next(e);
  }
}

export async function checkIn(req, res, next) {
  try {
    res.json({ data: await service.checkIn(req.user.id), error: null });
  } catch (e) {
    next(e);
  }
}

export async function checkOut(req, res, next) {
  try {
    res.json({ data: await service.checkOut(req.user.id), error: null });
  } catch (e) {
    next(e);
  }
}

export async function getTeam(req, res, next) {
  try {
    const data = await service.getTeam(req.user.id, defYear(req.query), defMonth(req.query));
    res.json({ data, error: null });
  } catch (e) {
    next(e);
  }
}

// ── Regularizations ──
export async function createRegularization(req, res, next) {
  try {
    const { date, reason } = req.body || {};
    if (!date || !reason?.trim()) throw new ApiError(400, 'Date and reason are required');
    res.json({ data: await service.createRegularization(req.user.id, date, reason.trim()), error: null });
  } catch (e) {
    next(e);
  }
}

export async function listMyRegularizations(req, res, next) {
  try {
    res.json({ data: await service.listMyRegularizations(req.user.id), error: null });
  } catch (e) {
    next(e);
  }
}

export async function listTeamRegularizations(req, res, next) {
  try {
    res.json({ data: await service.listTeamRegularizations(req.user.id), error: null });
  } catch (e) {
    next(e);
  }
}

export async function reviewRegularization(req, res, next) {
  try {
    const decision = req.params.decision === 'approve' ? 'approved' : 'rejected';
    const reg = await service.listTeamRegularizations(req.user.id).then((list) => list.find((r) => r.id === req.params.id));
    if (!reg) throw new ApiError(403, 'You can only review your team’s requests');
    res.json({ data: await service.reviewRegularization(req.params.id, req.user.id, decision), error: null });
  } catch (e) {
    next(e);
  }
}
