import { Router } from 'express';
import * as ctrl from './events.controller.js';

const router = Router();

router.get('/', ctrl.list); // ?filter&mine
router.get('/approvals', ctrl.approvals);
// Specific GETs before the '/:id' catch-all, or '/:id' swallows them.
router.get('/approval-modes', ctrl.approvalModes);
router.patch('/approval-modes/:reportId', ctrl.setApprovalMode);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);
router.post('/:id/owner', ctrl.changeOwner);
router.patch('/:id/sop', ctrl.updateSop);
router.post('/:id/comments', ctrl.addComment);
router.post('/tasks/:taskId/toggle', ctrl.toggleTask);
router.post('/tasks/:taskId/reject-assignment', ctrl.rejectAssignment);
router.post('/tasks/:taskId/extension', ctrl.requestExtension);
router.post('/tasks/:taskId/extension/:decision', ctrl.decideExtension);

export default router;
