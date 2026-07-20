import { api } from './client.js';

// Duties
export const getDuties = (userId) => api.get('/personal/duties', { params: { userId } }).then((r) => r.data.data);
export const addDuty = (userId, text) => api.post('/personal/duties', { userId, text }).then((r) => r.data.data);
export const deleteDuty = (id) => api.delete(`/personal/duties/${id}`).then((r) => r.data.data);

// OKRs
export const getOkrs = (userId, year, month) => api.get('/personal/okrs', { params: { userId, year, month } }).then((r) => r.data.data);
export const addOkr = (payload) => api.post('/personal/okrs', payload).then((r) => r.data.data);
export const updateOkr = (id, patch) => api.patch(`/personal/okrs/${id}`, patch).then((r) => r.data.data);
export const deleteOkr = (id) => api.delete(`/personal/okrs/${id}`).then((r) => r.data.data);
export const approveOkrs = (payload) => api.post('/personal/okrs/approve', payload).then((r) => r.data.data);

// Checklists
export const getChecklist = (userId) => api.get('/personal/checklist', { params: { userId } }).then((r) => r.data.data);
export const getPendingChecklist = (userId) => api.get('/personal/checklist/pending', { params: { userId } }).then((r) => r.data.data);
export const getDeadlines = (userId) => api.get('/personal/checklist-deadlines', { params: { userId } }).then((r) => r.data.data);
export const setDeadline = (userId, frequency, cfg) => api.put(`/personal/checklist-deadlines/${frequency}`, cfg, { params: { userId } }).then((r) => r.data.data);
export const getChecklistDelays = (userId, days) => api.get('/personal/checklist-delays', { params: { userId, days } }).then((r) => r.data.data);
export const addChecklistItem = (payload) => api.post('/personal/checklist', payload).then((r) => r.data.data);
export const deleteChecklistItem = (id) => api.delete(`/personal/checklist/${id}`).then((r) => r.data.data);
export const toggleChecklistItem = (id) => api.post(`/personal/checklist/${id}/toggle`).then((r) => r.data.data);
