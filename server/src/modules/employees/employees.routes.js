import { Router } from 'express';
import * as ctrl from './employees.controller.js';

const router = Router();

router.post('/', ctrl.onboard);          // HR: create/onboard a new employee
router.get('/me', ctrl.getMyProfile);    // self: my full profile + completion
router.get('/:id', ctrl.getProfile);     // self or HR: a profile
router.patch('/:id', ctrl.updateProfile); // self (self-editable) or HR (all)

export default router;
