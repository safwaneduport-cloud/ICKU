import { Router } from 'express';
import * as ctrl from './helpdesk.controller.js';

const router = Router();

router.get('/access', ctrl.getAccess);
router.get('/', ctrl.getMine);
router.get('/queue', ctrl.getQueue);
router.post('/', ctrl.create);
router.post('/:id/assign', ctrl.assign); // { assigneeId? } defaults to self
router.post('/:id/status/:status', ctrl.setStatus); // resolved | closed | ...

export default router;
