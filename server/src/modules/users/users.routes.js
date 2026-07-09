import { Router } from 'express';
import { getUsers, getUser, getReports, getProfile } from './users.controller.js';

const router = Router();

// GET /api/v1/users
router.get('/', getUsers);
// GET /api/v1/users/:id
router.get('/:id', getUser);
// GET /api/v1/users/:id/reports  (direct reports)
router.get('/:id/reports', getReports);
// GET /api/v1/users/:id/profile  (rich cross-module snapshot for the profile drawer)
router.get('/:id/profile', getProfile);

export default router;
