// Symmetric encryption for tokens at rest (Microsoft refresh/access tokens).
// AES-256-GCM with a key derived from JWT_REFRESH_SECRET — so no extra env var,
// but note: rotating that secret makes stored tokens undecryptable and users
// must reconnect. That's an acceptable trade for a self-service integration.
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const KEY = crypto.scryptSync(env.jwt.refreshSecret || 'dev-secret', 'icku-token-box', 32);

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload) {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
