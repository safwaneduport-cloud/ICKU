import { api } from './client.js';

// ── Expenses ──
export const getMyClaims = () => api.get('/expenses').then((r) => r.data.data);
export const createClaim = (payload) => api.post('/expenses', payload).then((r) => r.data.data);
export const cancelClaim = (id) => api.post(`/expenses/${id}/cancel`).then((r) => r.data.data);
export const expManagerQueue = () => api.get('/expenses/queue/manager').then((r) => r.data.data);
export const expFinanceQueue = () => api.get('/expenses/queue/finance').then((r) => r.data.data);
export const approveClaim = (id) => api.post(`/expenses/${id}/approve`).then((r) => r.data.data);
export const rejectClaim = (id) => api.post(`/expenses/${id}/reject`).then((r) => r.data.data);

// ── Assets ──
export const assetAccess = () => api.get('/assets/access').then((r) => r.data.data);
export const getMyAssets = () => api.get('/assets').then((r) => r.data.data);
export const getAllAssets = () => api.get('/assets/all').then((r) => r.data.data);
export const addAsset = (payload) => api.post('/assets', payload).then((r) => r.data.data);
export const assignAsset = (id, userId) => api.post(`/assets/${id}/assign`, { userId }).then((r) => r.data.data);

// ── Helpdesk ──
export const helpdeskAccess = () => api.get('/helpdesk/access').then((r) => r.data.data);
export const getMyTickets = () => api.get('/helpdesk').then((r) => r.data.data);
export const getTicketQueue = () => api.get('/helpdesk/queue').then((r) => r.data.data);
export const createTicket = (payload) => api.post('/helpdesk', payload).then((r) => r.data.data);
export const assignTicket = (id, assigneeId) => api.post(`/helpdesk/${id}/assign`, { assigneeId }).then((r) => r.data.data);
export const setTicketStatus = (id, status) => api.post(`/helpdesk/${id}/status/${status}`).then((r) => r.data.data);
