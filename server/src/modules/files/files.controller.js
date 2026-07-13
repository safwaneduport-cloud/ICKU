import { uploadDataUrl, storageEnabled } from '../../lib/storage.js';
import { ApiError } from '../../middleware/errorHandler.js';

// Accepts { dataUrl, name } and returns an attachment { kind, name, url }.
// With Supabase Storage configured → url is a bucket URL (tiny in the DB).
// Without → url is the original data URL (fallback, keeps dev working).
export async function upload(req, res, next) {
  try {
    const { dataUrl, name } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      throw new ApiError(400, 'No file provided');
    }
    const kind = dataUrl.startsWith('data:image/') ? 'image' : 'file';
    const url = storageEnabled ? await uploadDataUrl(dataUrl, name) : dataUrl;
    res.json({ data: { kind, name: name || 'file', url }, error: null });
  } catch (e) {
    next(e);
  }
}
