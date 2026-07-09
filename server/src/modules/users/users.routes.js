import { Router } from 'express';
import { getUsers, getUser, getReports } from './users.controller.js';

const router = Router();

// GET /api/v1/users
router.get('/', getUsers);
// GET /api/v1/users/:id
router.get('/:id', getUser);
// GET /api/v1/users/:id/reports  (direct reports)
router.get('/:id/reports', getReports);

export default router;
