import { api } from './client.js';

export const getMasterTypes = () => api.get('/masters/types').then((r) => r.data.data);
export const getMasterOptions = (type, q) =>
  api.get(`/masters/${type}/admin`, { params: q ? { q } : {} }).then((r) => r.data.data);
export const getActiveOptions = (type) => api.get(`/masters/${type}`).then((r) => r.data.data);
export const createMasterOption = (type, value) =>
  api.post(`/masters/${type}`, { value }).then((r) => r.data.data);
export const updateMasterOption = (id, patch) =>
  api.patch(`/masters/option/${id}`, patch).then((r) => r.data.data);
export const deleteMasterOption = (id) =>
  api.delete(`/masters/option/${id}`).then((r) => r.data.data);
