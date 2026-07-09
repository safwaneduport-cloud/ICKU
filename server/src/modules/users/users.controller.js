import * as service from './users.service.js';

export async function getUsers(req, res, next) {
  try {
    res.json({ data: await service.listUsers(), error: null });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req, res, next) {
  try {
    res.json({ data: await service.getUserById(req.params.id), error: null });
  } catch (err) {
    next(err);
  }
}

export async function getReports(req, res, next) {
  try {
    res.json({ data: await service.getDirectReports(req.params.id), error: null });
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    res.json({ data: await service.getProfile(req.params.id), error: null });
  } catch (err) {
    next(err);
  }
}
