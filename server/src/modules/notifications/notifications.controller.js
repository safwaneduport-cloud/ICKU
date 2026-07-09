import * as service from './notifications.service.js';

export async function getNotifications(req, res, next) {
  try {
    res.json({ data: await service.list(req.user), error: null });
  } catch (err) {
    next(err);
  }
}
