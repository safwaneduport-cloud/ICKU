import { Router } from 'express';
import * as ctrl from './payroll.controller.js';

const router = Router();

router.get('/access', ctrl.getAccess);
router.get('/payslip', ctrl.getPayslip); // ?userId&year&month
router.get('/run', ctrl.getRun); // ?year&month  (payroll admin)
router.post('/run/process', ctrl.processRun); // { year, month }
router.get('/compliance', ctrl.getCompliance); // ?year&month  (payroll admin)

export default router;
