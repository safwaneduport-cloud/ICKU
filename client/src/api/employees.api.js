import { api } from './client.js';

export const onboardEmployee = (payload) =>
  api.post('/employees', payload).then((r) => r.data.data);

export const getMyProfile = () => api.get('/employees/me').then((r) => r.data.data);
export const getEmployeeProfile = (id) => api.get(`/employees/${id}`).then((r) => r.data.data);
export const updateEmployeeProfile = (id, patch) =>
  api.patch(`/employees/${id}`, patch).then((r) => r.data.data);
