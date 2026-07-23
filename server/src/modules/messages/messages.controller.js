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

export async function removeMember(req, res, next) {
  try { ok(res, await service.removeMember(req.user.id, req.params.id, req.params.userId)); } catch (e) { next(e); }
}

export async function leaveConversation(req, res, next) {
  try { ok(res, await service.leaveConversation(req.user.id, req.params.id)); } catch (e) { next(e); }
}

export async function openDm(req, res, next) {
  try { ok(res, await service.openDm(req.user.id, req.params.userId)); } catch (e) { next(e); }
}

export async function openEventConversation(req, res, next) {
  try { ok(res, await service.openEventConversation(req.user.id, req.params.eventId)); } catch (e) { next(e); }
}

export async function listMessages(req, res, next) {
  try {
    const { before, focus, limit } = req.query;
    ok(res, await service.listMessages(req.user.id, req.params.id, { before, focus, limit }));
  } catch (e) { next(e); }
}

export async function postMessage(req, res, next) {
  try { ok(res, await service.postMessage(req.user.id, req.params.id, req.body || {})); } catch (e) { next(e); }
}

export async function listThread(req, res, next) {
  try { ok(res, await service.listThread(req.user.id, req.params.messageId)); } catch (e) { next(e); }
}

export async function myThreads(req, res, next) {
  try { ok(res, await service.myThreads(req.user.id)); } catch (e) { next(e); }
}

export async function markThreadRead(req, res, next) {
  try { ok(res, await service.markThreadRead(req.user.id, req.params.messageId)); } catch (e) { next(e); }
}

export async function listFiles(req, res, next) {
  try { ok(res, await service.filesFor(req.user.id)); } catch (e) { next(e); }
}

export async function searchMessages(req, res, next) {
  try { ok(res, await service.searchMessages(req.user.id, req.query.q)); } catch (e) { next(e); }
}

export async function markRead(req, res, next) {
  try { ok(res, await service.markRead(req.user.id, req.params.id)); } catch (e) { next(e); }
}

export async function markUnread(req, res, next) {
  try { ok(res, await service.markUnread(req.user.id, req.params.id, req.body?.messageId)); } catch (e) { next(e); }
}
export async function setSection(req, res, next) {
  try { ok(res, await service.setSection(req.user.id, req.params.id, req.body?.section)); } catch (e) { next(e); }
}

export async function setMute(req, res, next) {
  try { ok(res, await service.setMute(req.user.id, req.params.id, !!req.body?.muted)); } catch (e) { next(e); }
}

export async function setDescription(req, res, next) {
  try { ok(res, await service.setDescription(req.user.id, req.params.id, req.body?.description)); } catch (e) { next(e); }
}

export async function editMessage(req, res, next) {
  try { ok(res, await service.editMessage(req.user.id, req.params.messageId, req.body?.body)); } catch (e) { next(e); }
}

export async function deleteMessage(req, res, next) {
  try { ok(res, await service.deleteMessage(req.user.id, req.params.messageId)); } catch (e) { next(e); }
}

export async function reactMessage(req, res, next) {
  try { ok(res, await service.toggleReaction(req.user.id, req.params.messageId, req.body?.emoji)); } catch (e) { next(e); }
}

export async function pinMessage(req, res, next) {
  try { ok(res, await service.setPin(req.user.id, req.params.messageId, true)); } catch (e) { next(e); }
}

export async function unpinMessage(req, res, next) {
  try { ok(res, await service.setPin(req.user.id, req.params.messageId, false)); } catch (e) { next(e); }
}

export async function listPinned(req, res, next) {
  try { ok(res, await service.listPinned(req.user.id, req.params.id)); } catch (e) { next(e); }
}

// reminders
export async function listReminders(req, res, next) {
  try { ok(res, await service.listReminders(req.user.id)); } catch (e) { next(e); }
}
export async function createReminder(req, res, next) {
  try { ok(res, await service.createReminder(req.user.id, req.body || {})); } catch (e) { next(e); }
}
export async function completeReminder(req, res, next) {
  try { ok(res, await service.completeReminder(req.user.id, req.params.id)); } catch (e) { next(e); }
}
export async function deleteReminder(req, res, next) {
  try { ok(res, await service.deleteReminder(req.user.id, req.params.id)); } catch (e) { next(e); }
}
