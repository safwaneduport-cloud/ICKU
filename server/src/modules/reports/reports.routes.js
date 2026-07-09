import { Router } from 'express';
import * as service from './reports.service.js';
import { canReports } from '../../lib/access.js';
import { ApiError } from '../../middleware/errorHandler.js';

const router = Router();

router.get('/access', (req, res) => {
  res.json({ data: { canReports: canReports(req.user) }, error: null });
});

router.get('/overview', async (req, res, next) => {
  try {
    if (!canReports(req.user)) throw new ApiError(403, 'Analytics access required');
    res.json({ data: await service.overview(), error: null });
  } catch (e) { next(e); }
});

export default router;
