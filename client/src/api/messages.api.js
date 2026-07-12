import { api } from './client.js';

export const getConversations = () =>
  api.get('/messages/conversations').then((r) => r.data.data);

export const getConversation = (id) =>
  api.get(`/messages/conversations/${id}`).then((r) => r.data.data);

export const getMessages = (id) =>
  api.get(`/messages/conversations/${id}/messages`).then((r) => r.data.data);

export const postMessage = (id, payload) =>
  api.post(`/messages/conversations/${id}/messages`, payload).then((r) => r.data.data);

export const getThread = (messageId) =>
  api.get(`/messages/thread/${messageId}`).then((r) => r.data.data);

export const createGroup = (name, memberIds) =>
  api.post('/messages/groups', { name, memberIds }).then((r) => r.data.data);

export const addMembers = (id, memberIds) =>
  api.post(`/messages/groups/${id}/members`, { memberIds }).then((r) => r.data.data);

export const openDm = (userId) =>
  api.post(`/messages/dm/${userId}`).then((r) => r.data.data);

export const openEventConversation = (eventId) =>
  api.post(`/messages/event/${eventId}`).then((r) => r.data.data);

export const markRead = (id) =>
  api.post(`/messages/conversations/${id}/read`).then((r) => r.data.data);
