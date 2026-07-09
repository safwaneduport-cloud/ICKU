import { api } from './client.js';

export const getUsers = () => api.get('/users').then((r) => r.data.data);

export const getReports = (id) =>
  api.get(`/users/${id}/reports`).then((r) => r.data.data);

export const getHealth = () => api.get('/health').then((r) => r.data.data);
