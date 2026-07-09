import { Router } from 'express';
import { getDepartments } from './departments.controller.js';

const router = Router();

// GET /api/v1/departments
router.get('/', getDepartments);

export default router;
