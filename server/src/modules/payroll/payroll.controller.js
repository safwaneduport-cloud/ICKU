import * as service from './payroll.service.js';
import { canPayroll } from '../../lib/access.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { ApiError } from '../../middleware/errorHandler.js';

const now = () => new Date();
const defYear = (q) => Number(q.year) || now().getFullYear();
const defMonth = (q) => Number(q.month) || now().getMonth() + 1;

// GET /payroll/payslip?userId&year&month — self, a report, or payroll admin.
export async function getPayslip(req, res, next) {
  try {
    const targetId = req.query.userId || req.user.id;
    const allowed =
      targetId === req.user.id ||
      canPayroll(req.user) ||
      (await isManagerOf(req.user.id, targetId));
    if (!allowed) throw new ApiError(403, 'Not permitted to view this payslip');
    res.json({ data: await service.getPayslip(targetId, defYear(req.query), defMonth(req.query)), error: null });
  } catch (e) { next(e); }
}

export async function getRun(req, res, next) {
  try {
    if (!canPayroll(req.user)) throw new ApiError(403, 'Payroll access required');
    res.json({ data: await service.getRun(defYear(req.query), defMonth(req.query)), error: null });
  } catch (e) { next(e); }
}

export async function processRun(req, res, next) {
  try {
    if (!canPayroll(req.user)) throw new ApiError(403, 'Payroll access required');
    const { year, month } = req.body || {};
    if (!year || !month) throw new ApiError(400, 'year and month are required');
    await service.processRun(Number(year), Number(month), req.user.id);
    res.json({ data: await service.getRun(Number(year), Number(month)), error: null });
  } catch (e) { next(e); }
}

export async function getCompliance(req, res, next) {
  try {
    if (!canPayroll(req.user)) throw new ApiError(403, 'Payroll access required');
    res.json({ data: await service.getCompliance(defYear(req.query), defMonth(req.query)), error: null });
  } catch (e) { next(e); }
}

// Convenience: is the caller a payroll admin? (drives the UI tabs)
export function getAccess(req, res) {
  res.json({ data: { canPayroll: canPayroll(req.user) }, error: null });
}
