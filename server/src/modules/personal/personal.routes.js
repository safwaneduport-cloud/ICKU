import { Router } from 'express';
import * as ctrl from './personal.controller.js';

const router = Router();

// Duties
router.get('/duties', ctrl.getDuties); // ?userId
router.post('/duties', ctrl.addDuty);
router.delete('/duties/:id', ctrl.deleteDuty);

// OKRs
router.get('/okrs', ctrl.getOkrs); // ?userId&year&month
router.post('/okrs', ctrl.addOkr);
router.patch('/okrs/:id', ctrl.updateOkr);
router.delete('/okrs/:id', ctrl.deleteOkr);
router.post('/okrs/approve', ctrl.approveOkrs);

// Checklists — specific string routes before any '/:id' catch-alls.
router.get('/checklist', ctrl.getChecklist); // ?userId
router.get('/checklist/pending', ctrl.getPendingChecklist); // ?userId
router.get('/checklist/history', ctrl.getChecklistHistory); // ?userId — 7-day activity
router.get('/checklist/blackmarks', ctrl.checklistBlackMarks); // ?userId&days
router.post('/checklist/clear-all', ctrl.clearAllPending); // manager only
router.post('/checklist/restore/:activityId', ctrl.restoreChecklistItem);
router.post('/checklist', ctrl.addChecklistItem);
router.patch('/checklist/:id', ctrl.updateChecklistItem);
router.delete('/checklist/:id', ctrl.deleteChecklistItem);
router.post('/checklist/:id/toggle', ctrl.toggleChecklistItem);

// Deadlines + delay reporting (manager-facing; UI lands in My Team, Phase D)
router.get('/checklist-deadlines', ctrl.getDeadlines); // ?userId
router.put('/checklist-deadlines/:frequency', ctrl.setDeadline); // ?userId
router.get('/checklist-delays', ctrl.checklistDelays); // ?userId&days

export default router;
