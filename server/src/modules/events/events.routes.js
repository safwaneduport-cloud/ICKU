import { Router } from 'express';
import * as ctrl from './events.controller.js';

const router = Router();

router.get('/', ctrl.list); // ?filter&mine
router.get('/approvals', ctrl.approvals);
router.get('/approval-history', ctrl.approvalHistory); // projects I've decided
// Specific GETs before the '/:id' catch-all, or '/:id' swallows them.
router.get('/approval-modes', ctrl.approvalModes);
router.patch('/approval-modes/:reportId', ctrl.setApprovalMode);
router.get('/assigned', ctrl.assignedTasks); // ?userId — tasks assigned to a report
router.get('/task-stats', ctrl.taskMonthStats); // ?userId&year&month — monthly task delay stats
router.get('/task-pending', ctrl.taskPending); // ?userId — currently-pending tasks
router.get('/task-approvals', ctrl.taskApprovals); // project-task assignments pending my approval
router.get('/owner-approvals', ctrl.ownerApprovals); // ownership transfers pending my approval
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);
router.post('/:id/owner', ctrl.changeOwner);
router.post('/:id/tasks', ctrl.addTask); // add a task to an existing project
router.post('/:id/owner/decision/:decision', ctrl.decideOwnerTransfer); // approve/reject a held transfer
router.patch('/:id/sop', ctrl.updateSop);
router.post('/:id/comments', ctrl.addComment);
router.post('/tasks/:taskId/toggle', ctrl.toggleTask);
router.post('/tasks/:taskId/reject-assignment', ctrl.rejectAssignment);
router.post('/tasks/:taskId/assignees', ctrl.addTaskAssignees); // reassign: add recipients
router.delete('/tasks/:taskId/assignees/:userId', ctrl.removeTaskAssignee); // reassign: drop a recipient
router.post('/tasks/:taskId/assignee/:userId/decision/:decision', ctrl.decideTaskAssignee); // per-recipient approval
router.post('/tasks/:taskId/extension', ctrl.requestExtension);
router.post('/tasks/:taskId/extension/:decision', ctrl.decideExtension);

export default router;
