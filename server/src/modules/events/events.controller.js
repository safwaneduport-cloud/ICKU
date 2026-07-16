import * as service from './events.service.js';

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
  try { res.json({ data: await service.changeOwner(req.params.id, req.user.id, req.body?.ownerId), error: null }); }
  catch (e) { next(e); }
}

export async function toggleTask(req, res, next) {
  try { res.json({ data: await service.toggleTask(req.params.taskId, req.user.id), error: null }); }
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
