import { api } from './client.js';

export const getTypes = () => api.get('/leave/types').then((r) => r.data.data);
export const getBalances = (userId) =>
  api.get('/leave/balances', { params: userId ? { userId } : {} }).then((r) => r.data.data);
export const getMyRequests = () => api.get('/leave/requests').then((r) => r.data.data);
export const createRequest = (payload) => api.post('/leave/requests', payload).then((r) => r.data.data);
export const cancelRequest = (id) => api.post(`/leave/requests/${id}/cancel`).then((r) => r.data.data);
export const getTeam = () => api.get('/leave/team').then((r) => r.data.data);
export const reviewRequest = (id, decision) =>
  api.post(`/leave/requests/${id}/${decision}`).then((r) => r.data.data);
