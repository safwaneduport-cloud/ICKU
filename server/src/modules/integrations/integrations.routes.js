import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import * as ctrl from './integrations.controller.js';

const router = Router();

// The callback is reached by Microsoft's top-level browser redirect, so it can't
// require a Bearer token — it's verified by the signed `state` instead. The rest
// are per-user and authenticated.
router.get('/microsoft/callback', ctrl.microsoftCallback);
router.get('/microsoft/status', authenticate, ctrl.microsoftStatus);
router.get('/microsoft/connect', authenticate, ctrl.microsoftConnect);
router.get('/microsoft/calendar', authenticate, ctrl.microsoftCalendar);
router.delete('/microsoft', authenticate, ctrl.microsoftDisconnect);

export default router;
