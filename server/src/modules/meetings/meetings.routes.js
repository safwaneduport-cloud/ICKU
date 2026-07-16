import { Router } from 'express';
import * as ctrl from './meetings.controller.js';

const router = Router();

router.get('/meta', ctrl.getMeta);
router.get('/', ctrl.list); // ?scope=mine|all
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/minutes', ctrl.updateMinutes);
router.post('/:id/actions', ctrl.addAction);
router.post('/:id/actions/:actionId/toggle', ctrl.toggleAction);

export default router;
