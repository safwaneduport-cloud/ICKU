import { Router } from 'express';
import * as ctrl from './expenses.controller.js';

const router = Router();

router.get('/', ctrl.getMine);
router.post('/', ctrl.create);
router.post('/:id/cancel', ctrl.cancel);
router.get('/queue/manager', ctrl.managerQueue);
router.get('/queue/finance', ctrl.financeQueue);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);

export default router;
