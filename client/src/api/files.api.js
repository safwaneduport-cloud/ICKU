import { api } from './client.js';

// Uploads a browser data URL; returns { kind, name, url }.
export const uploadFile = (dataUrl, name) =>
  api.post('/files/upload', { dataUrl, name }).then((r) => r.data.data);
