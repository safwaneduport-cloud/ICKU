import { api } from './client.js';

export const getMyTasks = () => api.get('/direct-tasks/mine').then((r) => r.data.data);
export const getTasksIAssigned = () => api.get('/direct-tasks/assigned').then((r) => r.data.data);
export const getTaskApprovals = () => api.get('/direct-tasks/approvals').then((r) => r.data.data);
export const getReportTasks = (userId) => api.get(`/direct-tasks/for/${userId}`).then((r) => r.data.data);
export const createDirectTask = (payload) => api.post('/direct-tasks', payload).then((r) => r.data.data);
export const toggleDirectTask = (id) => api.post(`/direct-tasks/${id}/toggle`).then((r) => r.data.data);
export const decideDirectTask = (id, userId, decision) => api.post(`/direct-tasks/${id}/assignee/${userId}/decision/${decision}`).then((r) => r.data.data);
export const rejectDirectAssignment = (id, body) => api.post(`/direct-tasks/${id}/reject-assignment`, body).then((r) => r.data.data);
export const addDirectAssignees = (id, userIds) => api.post(`/direct-tasks/${id}/assignees`, { userIds }).then((r) => r.data.data);
export const removeDirectAssignee = (id, userId) => api.delete(`/direct-tasks/${id}/assignees/${userId}`).then((r) => r.data.data);
export const deleteDirectTask = (id) => api.delete(`/direct-tasks/${id}`).then((r) => r.data.data);
