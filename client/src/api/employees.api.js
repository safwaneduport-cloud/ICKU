import { api } from './client.js';

export const onboardEmployee = (payload) =>
  api.post('/employees', payload).then((r) => r.data.data);
