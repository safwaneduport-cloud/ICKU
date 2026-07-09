import * as service from './personal.service.js';
import { isManagerOf } from '../../lib/orgTree.js';
import { canAdmin } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

// View or manage: self, the person's manager, or an admin.
async function assertManage(actor, targetId) {
  if (targetId === actor.id || canAdmin(actor) || (await isManagerOf(actor.id, targetId))) return;
  throw new ApiError(403, 'Not permitted for this user');
}
// Supervisor-only (NOT self): the person's manager or an admin.
async function assertSupervise(actor, targetId) {
  if (canAdmin(actor) || (await isManagerOf(actor.id, targetId))) return;
  throw new ApiError(403, 'Only the reporting manager or an admin can do this');
}

const targetOf = (req) => req.query.userId || req.body?.userId || req.user.id;

// ── Duties ──
export async function getDuties(req, res, next) {
  try { const t = targetOf(req); await assertManage(req.user, t); res.json({ data: await service.getDuties(t), error: null }); }
  catch (e) { next(e); }
}
export async function addDuty(req, res, next) {
  try {
    const t = req.body?.userId;
    await assertSupervise(req.user, t);
    if (!req.body?.text?.trim()) throw new ApiError(400, 'Text is required');
    res.json({ data: await service.addDuty(t, req.body.text, req.user.id), error: null });
  } catch (e) { next(e); }
}
export async function deleteDuty(req, res, next) {
  try {
    const d = await service.dutyOwner(req.params.id);
    if (!d) throw new ApiError(404, 'Duty not found');
    await assertSupervise(req.user, d.userId);
    res.json({ data: await service.deleteDuty(req.params.id), error: null });
  } catch (e) { next(e); }
}

// ── OKRs ──
export async function getOkrs(req, res, next) {
  try {
    const t = targetOf(req);
    await assertManage(req.user, t);
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    res.json({ data: { ...(await service.getOkrs(t, year, month)), year, month }, error: null });
  } catch (e) { next(e); }
}
export async function addOkr(req, res, next) {
  try {
    const { userId: t, year, month, objective, target } = req.body || {};
    await assertManage(req.user, t);
    if (!objective?.trim()) throw new ApiError(400, 'Objective is required');
    res.json({ data: await service.addOkr(t, Number(year), Number(month), objective, target, req.user.id), error: null });
  } catch (e) { next(e); }
}
export async function updateOkr(req, res, next) {
  try {
    const o = await service.okrOwner(req.params.id);
    if (!o) throw new ApiError(404, 'OKR not found');
    await assertManage(req.user, o.userId);
    res.json({ data: await service.updateOkr(req.params.id, req.body || {}), error: null });
  } catch (e) { next(e); }
}
export async function deleteOkr(req, res, next) {
  try {
    const o = await service.okrOwner(req.params.id);
    if (!o) throw new ApiError(404, 'OKR not found');
    await assertManage(req.user, o.userId);
    res.json({ data: await service.deleteOkr(req.params.id), error: null });
  } catch (e) { next(e); }
}
export async function approveOkrs(req, res, next) {
  try {
    const { userId: t, year, month, approved } = req.body || {};
    await assertSupervise(req.user, t);
    res.json({ data: await service.setApproved(t, Number(year), Number(month), !!approved), error: null });
  } catch (e) { next(e); }
}

// ── Checklists ──
export async function getChecklist(req, res, next) {
  try { const t = targetOf(req); await assertManage(req.user, t); res.json({ data: await service.getChecklist(t), error: null }); }
  catch (e) { next(e); }
}
export async function addChecklistItem(req, res, next) {
  try {
    const { userId: t, frequency, text } = req.body || {};
    await assertManage(req.user, t);
    if (!text?.trim()) throw new ApiError(400, 'Text is required');
    res.json({ data: await service.addChecklistItem(t, frequency, text, req.user.id), error: null });
  } catch (e) { next(e); }
}
export async function updateChecklistItem(req, res, next) {
  try {
    const it = await service.checklistOwner(req.params.id);
    if (!it) throw new ApiError(404, 'Item not found');
    await assertManage(req.user, it.userId);
    res.json({ data: await service.updateChecklistItem(req.params.id, req.body?.text || ''), error: null });
  } catch (e) { next(e); }
}
export async function deleteChecklistItem(req, res, next) {
  try {
    const it = await service.checklistOwner(req.params.id);
    if (!it) throw new ApiError(404, 'Item not found');
    await assertManage(req.user, it.userId);
    res.json({ data: await service.deleteChecklistItem(req.params.id), error: null });
  } catch (e) { next(e); }
}
export async function toggleChecklistItem(req, res, next) {
  try {
    const it = await service.checklistOwner(req.params.id);
    if (!it) throw new ApiError(404, 'Item not found');
    await assertManage(req.user, it.userId);
    res.json({ data: await service.toggleChecklistItem(req.params.id), error: null });
  } catch (e) { next(e); }
}
