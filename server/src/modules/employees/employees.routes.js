import { Router } from 'express';
import * as ctrl from './employees.controller.js';

const router = Router();

router.post('/', ctrl.onboard); // HR: create/onboard a new employee

export default router;
