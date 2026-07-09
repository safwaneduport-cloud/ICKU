import { Router } from 'express';
import * as ctrl from './engagement.controller.js';

const router = Router();

router.get('/overview', ctrl.overview);
router.post('/kudos', ctrl.giveKudos);
router.post('/poll/:pollId/vote', ctrl.vote);

export default router;
