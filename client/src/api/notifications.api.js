import { api } from './client.js';

export const getNotifications = () =>
  api.get('/notifications').then((r) => r.data.data);
