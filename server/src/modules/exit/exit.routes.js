import { Router } from 'express';
import * as ctrl from './exit.controller.js';

const router = Router();

router.get('/meta', ctrl.getMeta);
router.get('/me', ctrl.getMine);
router.get('/team', ctrl.getTeam);
router.post('/', ctrl.submit);
router.post('/:id/withdraw', ctrl.withdraw);
router.post('/:id/clearance', ctrl.toggleClearance); // { step }
router.post('/:id/interview', ctrl.setInterview); // { value }

export default router;
