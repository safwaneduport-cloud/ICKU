import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errorHandler.js';

// A Supabase Storage client, only when configured. Uploads go to a public
// bucket under an unguessable random path; the DB stores just the URL.
const client = env.supabase.url && env.supabase.serviceKey
  ? createClient(env.supabase.url, env.supabase.serviceKey, { auth: { persistSession: false } })
  : null;

export const storageEnabled = !!client;

const safeName = (name = 'file') => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';

// Upload a browser data URL ("data:<mime>;base64,<...>") → returns a public URL.
// Returns null when storage isn't configured (caller falls back to the data URL).
export async function uploadDataUrl(dataUrl, name) {
  if (!client) return null;
  const m = /^data:(.*?);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) throw new ApiError(400, 'Invalid file data');
  const contentType = m[1] || 'application/octet-stream';
  const buffer = Buffer.from(m[2], 'base64');
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName(name)}`;

  const { error } = await client.storage.from(env.supabase.bucket).upload(path, buffer, { contentType, upsert: false });
  if (error) throw new ApiError(502, `Upload failed: ${error.message}`);

  const { data } = client.storage.from(env.supabase.bucket).getPublicUrl(path);
  return data.publicUrl;
}
