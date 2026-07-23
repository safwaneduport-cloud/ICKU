import { api } from './client.js';

export const getConversations = () =>
  api.get('/messages/conversations').then((r) => r.data.data);

export const getConversation = (id) =>
  api.get(`/messages/conversations/${id}`).then((r) => r.data.data);

export const setSection = (id, section) =>
  api.patch(`/messages/conversations/${id}/section`, { section }).then((r) => r.data.data);

export const getMessages = (id) =>
  api.get(`/messages/conversations/${id}/messages`).then((r) => r.data.data);

export const postMessage = (id, payload) =>
  api.post(`/messages/conversations/${id}/messages`, payload).then((r) => r.data.data);

export const getThread = (messageId) =>
  api.get(`/messages/thread/${messageId}`).then((r) => r.data.data);

export const getMyThreads = () =>
  api.get('/messages/threads/mine').then((r) => r.data.data);

export const getFiles = () =>
  api.get('/messages/files').then((r) => r.data.data);

export const searchMessages = (q) =>
  api.get('/messages/search', { params: { q } }).then((r) => r.data.data);

export const createGroup = (name, memberIds) =>
  api.post('/messages/groups', { name, memberIds }).then((r) => r.data.data);

export const addMembers = (id, memberIds) =>
  api.post(`/messages/groups/${id}/members`, { memberIds }).then((r) => r.data.data);

export const removeMember = (id, userId) =>
  api.delete(`/messages/groups/${id}/members/${userId}`).then((r) => r.data.data);

export const leaveConversation = (id) =>
  api.post(`/messages/conversations/${id}/leave`).then((r) => r.data.data);

export const openDm = (userId) =>
  api.post(`/messages/dm/${userId}`).then((r) => r.data.data);

export const openEventConversation = (eventId) =>
  api.post(`/messages/event/${eventId}`).then((r) => r.data.data);

export const markRead = (id) =>
  api.post(`/messages/conversations/${id}/read`).then((r) => r.data.data);

export const markUnread = (id, messageId) =>
  api.post(`/messages/conversations/${id}/unread`, { messageId }).then((r) => r.data.data);

// single-message actions
export const editMessage = (messageId, body) =>
  api.patch(`/messages/message/${messageId}`, { body }).then((r) => r.data.data);

export const deleteMessage = (messageId) =>
  api.delete(`/messages/message/${messageId}`).then((r) => r.data.data);

export const reactMessage = (messageId, emoji) =>
  api.post(`/messages/message/${messageId}/react`, { emoji }).then((r) => r.data.data);

export const pinMessage = (messageId) =>
  api.post(`/messages/message/${messageId}/pin`).then((r) => r.data.data);

export const unpinMessage = (messageId) =>
  api.delete(`/messages/message/${messageId}/pin`).then((r) => r.data.data);

export const getPinned = (conversationId) =>
  api.get(`/messages/conversations/${conversationId}/pins`).then((r) => r.data.data);

// reminders ("Remind me")
export const getReminders = () =>
  api.get('/messages/reminders').then((r) => r.data.data);

export const createReminder = (payload) =>
  api.post('/messages/reminders', payload).then((r) => r.data.data);

export const completeReminder = (id) =>
  api.post(`/messages/reminders/${id}/complete`).then((r) => r.data.data);

export const deleteReminder = (id) =>
  api.delete(`/messages/reminders/${id}`).then((r) => r.data.data);
