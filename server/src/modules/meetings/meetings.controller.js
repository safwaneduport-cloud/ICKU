import * as service from './meetings.service.js';
import { ApiError } from '../../middleware/errorHandler.js';

const canCreate = (user) => user?.tier !== 'Employee';

export function getMeta(req, res) {
  res.json({ data: { canCreate: canCreate(req.user), recurrences: ['One-off', 'Daily', 'Weekly', 'Monthly'] }, error: null });
}

export async function list(req, res, next) {
  try { res.json({ data: await service.list(req.user.id, req.query.scope), error: null }); }
  catch (e) { next(e); }
}

export async function get(req, res, next) {
  try { res.json({ data: await service.get(req.params.id), error: null }); }
  catch (e) { next(e); }
}

export async function create(req, res, next) {
  try {
    if (!canCreate(req.user)) throw new ApiError(403, 'You do not have permission to schedule meetings');
    res.json({ data: await service.create(req.user.id, req.body || {}), error: null });
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try { res.json({ data: await service.update(req.user, req.params.id, req.body || {}), error: null }); }
  catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try { res.json({ data: await service.remove(req.user, req.params.id), error: null }); }
  catch (e) { next(e); }
}

// Minutes + actions can be edited by the owner or any attendee.
async function requireParticipant(req) {
  if (!(await service.isParticipant(req.params.id, req.user.id))) {
    throw new ApiError(403, 'Only the chair or attendees can edit this meeting');
  }
}

export async function updateMinutes(req, res, next) {
  try {
    await requireParticipant(req);
    res.json({ data: await service.updateMinutes(req.params.id, req.body?.minutes ?? ''), error: null });
  } catch (e) { next(e); }
}

export async function addAction(req, res, next) {
  try {
    await requireParticipant(req);
    if (!req.body?.text?.trim()) throw new ApiError(400, 'Text is required');
    res.json({ data: await service.addAction(req.params.id, req.body.text, req.body.ownerId), error: null });
  } catch (e) { next(e); }
}

export async function toggleAction(req, res, next) {
  try {
    await requireParticipant(req);
    res.json({ data: await service.toggleAction(req.params.actionId), error: null });
  } catch (e) { next(e); }
}
