import { api } from './client.js';

// ── Meetings ──
export const meetingsMeta = () => api.get('/meetings/meta').then((r) => r.data.data);
export const getMeetings = (scope) => api.get('/meetings', { params: scope ? { scope } : {} }).then((r) => r.data.data);
export const getMeeting = (id) => api.get(`/meetings/${id}`).then((r) => r.data.data);
export const createMeeting = (payload) => api.post('/meetings', payload).then((r) => r.data.data);
export const updateMeeting = (id, payload) => api.patch(`/meetings/${id}`, payload).then((r) => r.data.data);
export const deleteMeeting = (id) => api.delete(`/meetings/${id}`).then((r) => r.data.data);
export const updateMinutes = (id, minutes) => api.patch(`/meetings/${id}/minutes`, { minutes }).then((r) => r.data.data);
export const addMeetingAction = (id, text, ownerId) => api.post(`/meetings/${id}/actions`, { text, ownerId }).then((r) => r.data.data);
export const toggleMeetingAction = (id, actionId) => api.post(`/meetings/${id}/actions/${actionId}/toggle`).then((r) => r.data.data);

// ── Workspaces ──
export const getWorkspaces = () => api.get('/workspaces').then((r) => r.data.data);
export const getWorkspace = (deptId) => api.get(`/workspaces/${deptId}`).then((r) => r.data.data);
