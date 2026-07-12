import { api } from './client.js';

export const getCredentials = () => api.get('/credentials').then((r) => r.data.data);
export const resetCredential = (userId, password) =>
  api.post(`/credentials/${userId}/reset`, password ? { password } : {}).then((r) => r.data.data);
export const updateCredentialUsername = (userId, username) =>
  api.patch(`/credentials/${userId}/username`, { username }).then((r) => r.data.data);
export const changeOwnPassword = (currentPassword, newPassword) =>
  api.post('/credentials/change-password', { currentPassword, newPassword }).then((r) => r.data.data);
