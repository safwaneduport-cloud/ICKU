import { Router } from 'express';
import * as ctrl from './assets.controller.js';

const router = Router();

router.get('/access', ctrl.getAccess);
router.get('/', ctrl.getMine);
router.get('/all', ctrl.getAll);
router.post('/', ctrl.create);
router.post('/:id/assign', ctrl.assign); // { userId } or empty → return
router.post('/:id/return', ctrl.returnToStock);

export default router;
