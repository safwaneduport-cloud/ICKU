import { Router } from 'express';
import * as service from './dashboard.service.js';

const router = Router();

router.get('/overview', async (req, res, next) => {
  try {
    res.json({ data: await service.overview(req.user), error: null });
  } catch (e) { next(e); }
});

export default router;
