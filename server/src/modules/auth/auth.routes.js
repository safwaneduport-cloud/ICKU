import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, refresh, logout, me } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

// Brute-force protection on login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, error: { message: 'Too many login attempts. Try again later.' } },
});

router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);

export default router;
