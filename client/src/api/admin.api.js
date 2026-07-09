import { api } from './client.js';

export const adminAccess = () => api.get('/admin/access').then((r) => r.data.data);

export const getAdminUsers = () => api.get('/admin/users').then((r) => r.data.data);
export const createUser = (p) => api.post('/admin/users', p).then((r) => r.data.data);
export const updateUser = (id, p) => api.patch(`/admin/users/${id}`, p).then((r) => r.data.data);

export const getAdminDepts = () => api.get('/admin/departments').then((r) => r.data.data);
export const createDept = (p) => api.post('/admin/departments', p).then((r) => r.data.data);
export const updateDept = (id, p) => api.patch(`/admin/departments/${id}`, p).then((r) => r.data.data);

export const getMatrix = () => api.get('/admin/matrix').then((r) => r.data.data);
export const setCapability = (tier, capability, enabled) =>
  api.post('/admin/matrix', { tier, capability, enabled }).then((r) => r.data.data);

export const getSettings = () => api.get('/admin/settings').then((r) => r.data.data);
export const toggleSetting = (key) => api.post(`/admin/settings/${key}/toggle`).then((r) => r.data.data);

export const getAudit = () => api.get('/admin/audit').then((r) => r.data.data);
