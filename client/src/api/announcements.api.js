import { api } from './client.js';

export const announcementsMeta = () => api.get('/announcements/meta').then((r) => r.data.data);
export const getAnnouncements = (scope) =>
  api.get('/announcements', { params: scope && scope !== 'all' ? { scope } : {} }).then((r) => r.data.data);
export const createAnnouncement = (payload) => api.post('/announcements', payload).then((r) => r.data.data);
export const ackAnnouncement = (id) => api.post(`/announcements/${id}/ack`).then((r) => r.data.data);
