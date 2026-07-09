import { api } from './client.js';

export const getDepartments = () =>
  api.get('/departments').then((r) => r.data.data);
