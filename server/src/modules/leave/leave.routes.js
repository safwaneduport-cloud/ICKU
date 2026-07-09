import { Router } from 'express';
import * as ctrl from './leave.controller.js';

const router = Router();

router.get('/types', ctrl.getTypes);
router.get('/balances', ctrl.getBalances); // ?userId&year
router.get('/requests', ctrl.getMyRequests);
router.post('/requests', ctrl.createRequest);
router.post('/requests/:id/cancel', ctrl.cancelRequest);
router.get('/team', ctrl.getTeam);
router.post('/requests/:id/:decision', ctrl.reviewRequest); // decision = approve | reject

export default router;
