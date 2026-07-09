import { Router } from 'express';
import * as ctrl from './events.controller.js';

const router = Router();

router.get('/', ctrl.list); // ?filter&mine
router.get('/approvals', ctrl.approvals);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);
router.post('/:id/owner', ctrl.changeOwner);
router.post('/:id/comments', ctrl.addComment);
router.post('/tasks/:taskId/toggle', ctrl.toggleTask);

export default router;
