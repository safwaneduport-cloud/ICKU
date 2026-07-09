import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Access token — short-lived, carries identity + role/tier for quick authz checks.
export function signAccessToken(user) {
  return jwt.sign(
    { role: user.role, tier: user.tier },
    env.jwt.accessSecret,
    { subject: user.id, expiresIn: env.jwt.accessTtl }
  );
}

// Refresh token — long-lived, only used to mint new access tokens.
export function signRefreshToken(user) {
  return jwt.sign(
    { type: 'refresh' },
    env.jwt.refreshSecret,
    { subject: user.id, expiresIn: env.jwt.refreshTtl }
  );
}

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);
