import { api } from './client.js';

// ── Onboarding ──
export const onbAccess = () => api.get('/onboarding/access').then((r) => r.data.data);
export const getOnboardings = () => api.get('/onboarding').then((r) => r.data.data);
export const addJoiner = (payload) => api.post('/onboarding', payload).then((r) => r.data.data);
export const toggleOnbItem = (id, item) => api.post(`/onboarding/${id}/toggle`, { item }).then((r) => r.data.data);

// ── Exit ──
export const exitMeta = () => api.get('/exit/meta').then((r) => r.data.data);
export const getMyExit = () => api.get('/exit/me').then((r) => r.data.data);
export const getTeamExits = () => api.get('/exit/team').then((r) => r.data.data);
export const submitExit = (payload) => api.post('/exit', payload).then((r) => r.data.data);
export const withdrawExit = (id) => api.post(`/exit/${id}/withdraw`).then((r) => r.data.data);
export const toggleClearance = (id, step) => api.post(`/exit/${id}/clearance`, { step }).then((r) => r.data.data);
export const setInterview = (id, value) => api.post(`/exit/${id}/interview`, { value }).then((r) => r.data.data);
