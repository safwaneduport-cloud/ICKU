import { api, setAccessToken } from './client.js';

export async function login(username, password) {
  const res = await api.post('/auth/login', { username, password });
  setAccessToken(res.data.data.accessToken);
  return res.data.data.user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

export const getMe = () => api.get('/auth/me').then((r) => r.data.data);
