import { api } from './client.js';

export const reportsAccess = () => api.get('/reports/access').then((r) => r.data.data);
export const getOverview = () => api.get('/reports/overview').then((r) => r.data.data);
