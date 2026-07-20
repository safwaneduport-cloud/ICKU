import * as service from './events.service.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function list(req, res, next) {
  try {
    const data = await service.list({
      filter: req.query.filter || 'all',
      mine: req.query.mine === 'true',
      userId: req.user.id,
    });
    res.json({ data, error: null });
  } catch (e) { next(e); }
}

export async function get(req, res, next) {
  try { res.json({ data: await service.get(req.params.id), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    const created = await service.create(req.user, req.body || {});
    res.json({ data: await service.get(created.id), error: null });
  } catch (e) { next(e); }
}

export async function approvals(req, res, next) {
  try { res.json({ data: await service.approvalsFor(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function approve(req, res, next) {
  try { res.json({ data: await service.decide(req.params.id, req.user.id, 'approved'), error: null }); }
  catch (e) { next(e); }
}

export async function reject(req, res, next) {
  try { res.json({ data: await service.decide(req.params.id, req.user.id, 'rejected'), error: null }); }
  catch (e) { next(e); }
}

export async function changeOwner(req, res, next) {
  try { res.json({ data: await service.changeOwner(req.user, req.params.id, req.body?.ownerId), error: null }); }
  catch (e) { next(e); }
}

export async function taskApprovals(req, res, next) {
  try { res.json({ data: await service.taskAssigneeApprovals(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function decideTaskAssignee(req, res, next) {
  try { res.json({ data: await service.decideTaskAssignee(req.user, req.params.taskId, req.params.userId, req.params.decision), error: null }); }
  catch (e) { next(e); }
}

export async function ownerApprovals(req, res, next) {
  try { res.json({ data: await service.ownerTransferApprovals(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function decideOwnerTransfer(req, res, next) {
  try { res.json({ data: await service.decideOwnerTransfer(req.user, req.params.id, req.params.decision), error: null }); }
  catch (e) { next(e); }
}

export async function toggleTask(req, res, next) {
  try { res.json({ data: await service.toggleTask(req.params.taskId, req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function rejectAssignment(req, res, next) {
  try { res.json({ data: await service.rejectAssignment(req.user, req.params.taskId, req.body || {}), error: null }); }
  catch (e) { next(e); }
}

export async function requestExtension(req, res, next) {
  try { res.json({ data: await service.requestExtension(req.user, req.params.taskId, req.body || {}), error: null }); }
  catch (e) { next(e); }
}

export async function decideExtension(req, res, next) {
  try { res.json({ data: await service.decideExtension(req.user, req.params.taskId, req.params.decision), error: null }); }
  catch (e) { next(e); }
}

export async function assignedTasks(req, res, next) {
  try {
    const t = req.query.userId || req.user.id;
    if (t !== req.user.id && !canAdmin(req.user) && !(await isManagerOf(req.user.id, t))) {
      throw new ApiError(403, 'Only their manager can view this');
    }
    res.json({ data: await service.assignedTasksFor(t), error: null });
  } catch (e) { next(e); }
}

export async function approvalModes(req, res, next) {
  try { res.json({ data: await service.reportsApprovalModes(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function setApprovalMode(req, res, next) {
  try { res.json({ data: await service.setReportApprovalMode(req.user, req.params.reportId, req.body || {}), error: null }); }
  catch (e) { next(e); }
}

export async function addComment(req, res, next) {
  try {
    const { body, parentId } = req.body || {};
    res.json({ data: await service.addComment(req.params.id, req.user.id, body, parentId), error: null });
  } catch (e) { next(e); }
}

export async function updateSop(req, res, next) {
  try { res.json({ data: await service.updateSop(req.user, req.params.id, req.body || {}), error: null }); }
  catch (e) { next(e); }
}
