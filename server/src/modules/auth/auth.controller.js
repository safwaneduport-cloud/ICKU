import * as service from './auth.service.js';
import { loginSchema } from './auth.validation.js';
import { verifyRefreshToken } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../middleware/errorHandler.js';

const REFRESH_COOKIE = 'icku_refresh';

// httpOnly so JavaScript can't read it (XSS protection); scoped to the auth path.
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.nodeEnv === 'production',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid input');
    }
    const { accessToken, refreshToken, user } = await service.login(
      parsed.data.username, parsed.data.password
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.json({ data: { accessToken, user }, error: null });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ApiError(401, 'No refresh token');
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
    const { accessToken, refreshToken, user } = await service.refresh(payload.sub);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts); // rotate on every refresh
    res.json({ data: { accessToken, user }, error: null });
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
  res.json({ data: { ok: true }, error: null });
}

export async function me(req, res, next) {
  try {
    res.json({ data: await service.me(req.user.id), error: null });
  } catch (err) {
    next(err);
  }
}
