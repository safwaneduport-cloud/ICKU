import { Router } from 'express';
import * as service from './workspaces.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try { res.json({ data: await service.list(), error: null }); }
  catch (e) { next(e); }
});

router.get('/:deptId', async (req, res, next) => {
  try { res.json({ data: await service.get(req.params.deptId), error: null }); }
  catch (e) { next(e); }
});

export default router;
