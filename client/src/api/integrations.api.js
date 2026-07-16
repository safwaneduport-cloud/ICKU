import { api } from './client.js';

export const getMicrosoftStatus = () =>
  api.get('/integrations/microsoft/status').then((r) => r.data.data);

// Returns the Microsoft sign-in URL; the caller does a full-page redirect.
export const getMicrosoftConnectUrl = () =>
  api.get('/integrations/microsoft/connect').then((r) => r.data.data.url);

export const disconnectMicrosoft = () =>
  api.delete('/integrations/microsoft').then((r) => r.data.data);

// The signed-in user's Outlook/Teams calendar for a window (from/to = ISO).
export const getMicrosoftCalendar = (from, to) =>
  api.get('/integrations/microsoft/calendar', { params: { from, to } }).then((r) => r.data.data);
