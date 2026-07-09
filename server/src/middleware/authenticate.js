import { verifyAccessToken } from '../lib/jwt.js';
import { ApiError } from './errorHandler.js';

// Verifies the Bearer access token and attaches req.user = { id, role, tier }.
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, tier: payload.tier };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired access token'));
  }
}
