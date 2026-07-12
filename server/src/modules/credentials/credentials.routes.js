import { Router } from 'express';
import * as ctrl from './credentials.controller.js';

const router = Router();

router.get('/', ctrl.list);                                  // HR: all logins
router.post('/:userId/reset', ctrl.resetPassword);           // HR: reset a login's password
router.patch('/:userId/username', ctrl.updateUsername);      // HR: edit a username
router.post('/change-password', ctrl.changeOwnPassword);     // self-service (routed before :userId? no — distinct path)

export default router;
