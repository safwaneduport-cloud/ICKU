import { Router } from 'express';
import { prisma } from '../../config/prisma.js';

const router = Router();

// GET /api/v1/health — liveness + DB connectivity check
router.get('/', async (req, res) => {
  let db = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'up';
  } catch {
    db = 'down';
  }
  res.json({ data: { status: 'ok', db, time: new Date().toISOString() }, error: null });
});

export default router;
