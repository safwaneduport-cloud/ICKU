import { api } from './client.js';

export const knowledgeMeta = () => api.get('/knowledge/meta').then((r) => r.data.data);
export const getDocs = (params) => api.get('/knowledge', { params }).then((r) => r.data.data);
export const getDoc = (id) => api.get(`/knowledge/${id}`).then((r) => r.data.data);
export const createDoc = (payload) => api.post('/knowledge', payload).then((r) => r.data.data);
