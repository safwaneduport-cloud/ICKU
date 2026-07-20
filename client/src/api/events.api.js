import { api } from './client.js';

export const getEvents = (filter, mine) =>
  api.get('/events', { params: { filter, mine } }).then((r) => r.data.data);
export const getEvent = (id) => api.get(`/events/${id}`).then((r) => r.data.data);
export const createEvent = (payload) => api.post('/events', payload).then((r) => r.data.data);
export const getApprovals = () => api.get('/events/approvals').then((r) => r.data.data);
export const approveEvent = (id) => api.post(`/events/${id}/approve`).then((r) => r.data.data);
export const rejectEvent = (id) => api.post(`/events/${id}/reject`).then((r) => r.data.data);
export const changeEventOwner = (id, ownerId) => api.post(`/events/${id}/owner`, { ownerId }).then((r) => r.data.data);
export const toggleTask = (taskId) => api.post(`/events/tasks/${taskId}/toggle`).then((r) => r.data.data);
export const rejectAssignment = (taskId, body) => api.post(`/events/tasks/${taskId}/reject-assignment`, body).then((r) => r.data.data);
export const requestExtension = (taskId, body) => api.post(`/events/tasks/${taskId}/extension`, body).then((r) => r.data.data);
export const decideExtension = (taskId, decision) => api.post(`/events/tasks/${taskId}/extension/${decision}`).then((r) => r.data.data);
export const getApprovalModes = () => api.get('/events/approval-modes').then((r) => r.data.data);
export const getAssignedTasks = (userId) => api.get('/events/assigned', { params: { userId } }).then((r) => r.data.data);
export const setApprovalMode = (reportId, patch) => api.patch(`/events/approval-modes/${reportId}`, patch).then((r) => r.data.data);
export const addEventComment = (id, body) => api.post(`/events/${id}/comments`, { body }).then((r) => r.data.data);
export const updateEventSop = (id, payload) => api.patch(`/events/${id}/sop`, payload).then((r) => r.data.data);
