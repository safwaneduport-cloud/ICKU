import axios from 'axios';

// ── In-memory access token ──────────────────────────────────────────
// Kept in a module variable (NOT localStorage) so it isn't exposed to XSS.
// The long-lived refresh token lives in an httpOnly cookie the JS can't read.
let accessToken = null;
export const setAccessToken = (t) => { accessToken = t; };
export const getAccessToken = () => accessToken;

// Called when refresh fails (session truly gone) so the app can drop to /login.
let onAuthFailure = null;
export const setOnAuthFailure = (fn) => { onAuthFailure = fn; };

// In dev, Vite proxies /api → the server. In production (single-service) the
// built app is served by Express at the same origin, so /api/v1 is relative.
// VITE_API_URL lets you point at a separate API host if you ever split them.
const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

// Main instance — interceptors attached.
export const api = axios.create({ baseURL, withCredentials: true });

// Bare instance for the refresh call itself (no interceptors → no recursion).
const bare = axios.create({ baseURL, withCredentials: true });

export async function refreshAccessToken() {
  const res = await bare.post('/auth/refresh');
  const { accessToken: token, user } = res.data.data;
  setAccessToken(token);
  return { token, user };
}

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// On a 401, transparently refresh once and retry the original request.
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const { token } = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (e) {
        setAccessToken(null);
        if (onAuthFailure) onAuthFailure();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);
