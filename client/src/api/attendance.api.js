import { api } from './client.js';

export const getMyMonth = (year, month) =>
  api.get('/attendance', { params: { year, month } }).then((r) => r.data.data);

export const getUserMonth = (userId, year, month) =>
  api.get('/attendance', { params: { userId, year, month } }).then((r) => r.data.data);

export const getToday = () => api.get('/attendance/me/today').then((r) => r.data.data);
export const checkIn = () => api.post('/attendance/check-in').then((r) => r.data.data);
export const checkOut = () => api.post('/attendance/check-out').then((r) => r.data.data);

export const getTeam = (year, month) =>
  api.get('/attendance/team', { params: { year, month } }).then((r) => r.data.data);

export const createRegularization = (date, reason) =>
  api.post('/attendance/regularizations', { date, reason }).then((r) => r.data.data);
export const getTeamRegularizations = () =>
  api.get('/attendance/regularizations/team').then((r) => r.data.data);
export const reviewRegularization = (id, decision) =>
  api.post(`/attendance/regularizations/${id}/${decision}`).then((r) => r.data.data);
