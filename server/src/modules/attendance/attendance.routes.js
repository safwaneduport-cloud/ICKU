import { Router } from 'express';
import * as ctrl from './attendance.controller.js';

const router = Router();

// Attendance
router.get('/', ctrl.getAttendance); // ?userId&year&month
router.get('/me/today', ctrl.getToday);
router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);
router.get('/team', ctrl.getTeam);

// Regularizations (nested under /attendance for a single mount point)
router.post('/regularizations', ctrl.createRegularization);
router.get('/regularizations/mine', ctrl.listMyRegularizations);
router.get('/regularizations/team', ctrl.listTeamRegularizations);
router.post('/regularizations/:id/:decision', ctrl.reviewRegularization); // decision = approve|reject

export default router;
