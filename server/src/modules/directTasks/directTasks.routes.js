import { Router } from 'express';
import * as ctrl from './directTasks.controller.js';

const router = Router();

// Specific GETs before any '/:id' routes.
router.get('/mine', ctrl.mine); // tasks assigned to me
router.get('/assigned', ctrl.assigned); // tasks I assigned
router.get('/approvals', ctrl.approvals); // pending my approval
router.get('/for/:userId', ctrl.forReport); // a report's tasks (manager)

router.post('/', ctrl.create);
router.post('/:id/toggle', ctrl.toggle);
router.post('/:id/assignee/:userId/decision/:decision', ctrl.decide); // approved | rejected, per recipient
router.post('/:id/reject-assignment', ctrl.rejectAssignment);
router.post('/:id/assignees', ctrl.addAssignees); // reassign: add recipients
router.delete('/:id/assignees/:userId', ctrl.removeAssignee); // reassign: drop a recipient
router.delete('/:id', ctrl.remove);

export default router;
