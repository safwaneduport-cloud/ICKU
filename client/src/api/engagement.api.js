import { api } from './client.js';

export const getEngagement = () => api.get('/engagement/overview').then((r) => r.data.data);
export const giveKudos = (toId, message) => api.post('/engagement/kudos', { toId, message }).then((r) => r.data.data);
export const votePoll = (pollId, optionId) => api.post(`/engagement/poll/${pollId}/vote`, { optionId }).then((r) => r.data.data);
