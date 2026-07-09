import * as service from './departments.service.js';

export async function getDepartments(req, res, next) {
  try {
    const departments = await service.listDepartments();
    res.json({ data: departments, error: null });
  } catch (err) {
    next(err);
  }
}
