import { Router } from 'express';
import * as ctrl from './announcements.controller.js';

const router = Router();

router.get('/meta', ctrl.getMeta);
router.get('/', ctrl.list); // ?scope
router.post('/', ctrl.create);
router.post('/:id/ack', ctrl.ack);

export default router;
