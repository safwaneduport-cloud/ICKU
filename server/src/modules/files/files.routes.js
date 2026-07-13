import { Router } from 'express';
import { upload } from './files.controller.js';

const router = Router();

// POST /api/v1/files/upload  → { kind, name, url }
router.post('/upload', upload);

export default router;
