import * as service from './engagement.service.js';

export async function overview(req, res, next) {
  try { res.json({ data: await service.overview(req.user.id), error: null }); }
  catch (e) { next(e); }
}

export async function giveKudos(req, res, next) {
  try {
    const { toId, message } = req.body || {};
    res.json({ data: await service.giveKudos(req.user.id, toId, message), error: null });
  } catch (e) { next(e); }
}

export async function vote(req, res, next) {
  try {
    res.json({ data: await service.vote(req.params.pollId, req.user.id, req.body?.optionId), error: null });
  } catch (e) { next(e); }
}
