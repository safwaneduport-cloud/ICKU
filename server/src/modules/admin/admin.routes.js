import { Router } from 'express';
import * as ctrl from './admin.controller.js';

const router = Router();

router.get('/access', ctrl.getAccess);

router.get('/users', ctrl.listUsers);
router.post('/users', ctrl.createUser);
router.patch('/users/:id', ctrl.updateUser);

router.get('/departments', ctrl.listDepartments);
router.post('/departments', ctrl.createDepartment);
router.patch('/departments/:id', ctrl.updateDepartment);

router.get('/matrix', ctrl.getMatrix);
router.post('/matrix', ctrl.setCapability);

router.get('/settings', ctrl.listSettings);
router.post('/settings/:key/toggle', ctrl.toggleSetting);

router.get('/audit', ctrl.listAudit);

export default router;
