import * as service from './messages.service.js';

const ok = (res, data) => res.json({ data, error: null });

export async function listConversations(req, res, next) {
  try { ok(res, await service.listConversations(req.user.id)); } catch (e) { next(e); }
}

export async function getConversation(req, res, next) {
  try { ok(res, await service.getConversation(req.user.id, req.params.id)); } catch (e) { next(e); }
}

export async function createGroup(req, res, next) {
  try {
    const { name, memberIds } = req.body || {};
    ok(res, await service.createGroup(req.user.id, name, memberIds));
  } catch (e) { next(e); }
}

export async function addMembers(req, res, next) {
  try { ok(res, await service.addMembers(req.user.id, req.params.id, req.body?.memberIds)); } catch (e) { next(e); }
}

export async function openDm(req, res, next) {
  try { ok(res, await service.openDm(req.user.id, req.params.userId)); } catch (e) { next(e); }
}

export async function listMessages(req, res, next) {
  try { ok(res, await service.listMessages(req.user.id, req.params.id)); } catch (e) { next(e); }
}

export async function postMessage(req, res, next) {
  try { ok(res, await service.postMessage(req.user.id, req.params.id, req.body || {})); } catch (e) { next(e); }
}

export async function listThread(req, res, next) {
  try { ok(res, await service.listThread(req.user.id, req.params.messageId)); } catch (e) { next(e); }
}

export async function markRead(req, res, next) {
  try { ok(res, await service.markRead(req.user.id, req.params.id)); } catch (e) { next(e); }
}
