import { Router } from 'express';
import * as ctrl from './onboarding.controller.js';

const router = Router();

router.get('/access', ctrl.getAccess);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/:id/toggle', ctrl.toggleItem); // { item }

export default router;
