import { api } from './client.js';

export const getDashboard = () => api.get('/dashboard/overview').then((r) => r.data.data);
