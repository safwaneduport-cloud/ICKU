import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { storageEnabled } from '../../lib/storage.js';

const router = Router();

// GET /api/v1/health — liveness + DB connectivity + storage-config flag.
// `storage` is just a boolean (no secrets) so config can be verified externally.
router.get('/', async (req, res) => {
  let db = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'up';
  } catch {
    db = 'down';
  }
  res.json({ data: { status: 'ok', db, storage: storageEnabled ? 'supabase' : 'fallback', time: new Date().toISOString() }, error: null });
});

export default router;
