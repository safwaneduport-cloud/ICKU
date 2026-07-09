import { Router } from 'express';
import { getNotifications } from './notifications.controller.js';

const router = Router();

// GET /api/v1/notifications  (personalized feed for the topbar bell)
router.get('/', getNotifications);

export default router;
