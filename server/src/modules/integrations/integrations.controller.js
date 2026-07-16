import * as ms from './microsoft.service.js';

export async function microsoftStatus(req, res, next) {
  try { res.json({ data: await ms.status(req.user.id), error: null }); } catch (e) { next(e); }
}

// Returns the Microsoft sign-in URL; the client does a full-page redirect to it.
export async function microsoftConnect(req, res, next) {
  try { res.json({ data: { url: ms.authUrl(req.user.id, req) }, error: null }); } catch (e) { next(e); }
}

// Hit by Microsoft's browser redirect (no auth header) — state-verified inside.
// On success/failure we bounce back to the app's Profile page with a flag.
export async function microsoftCallback(req, res) {
  const back = (flag) => res.redirect(`/profile?ms=${flag}`);
  try {
    if (req.query.error) return back('denied');
    await ms.handleCallback(req.query.code, req.query.state, req);
    return back('connected');
  } catch (e) {
    return res.redirect(`/profile?ms=error&msg=${encodeURIComponent(e.message || 'failed')}`);
  }
}

export async function microsoftDisconnect(req, res, next) {
  try { res.json({ data: await ms.disconnect(req.user.id), error: null }); } catch (e) { next(e); }
}

export async function microsoftCalendar(req, res, next) {
  try { res.json({ data: await ms.listCalendar(req.user.id, req.query.from, req.query.to), error: null }); } catch (e) { next(e); }
}
