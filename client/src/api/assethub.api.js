import { api } from './client.js';

const d = (r) => r.data.data;

export const getAssetAccess = () => api.get('/assethub/access').then(d);
export const getAssetMasters = () => api.get('/assethub/masters').then(d);

export const createCategory = (p) => api.post('/assethub/categories', p).then(d);
export const updateCategory = (id, p) => api.patch(`/assethub/categories/${id}`, p).then(d);
export const createSubCategory = (p) => api.post('/assethub/subcategories', p).then(d);
export const updateSubCategory = (id, p) => api.patch(`/assethub/subcategories/${id}`, p).then(d);
export const createSite = (p) => api.post('/assethub/sites', p).then(d);
export const updateSite = (id, p) => api.patch(`/assethub/sites/${id}`, p).then(d);
export const createBuilding = (p) => api.post('/assethub/buildings', p).then(d);
export const updateBuilding = (id, p) => api.patch(`/assethub/buildings/${id}`, p).then(d);
export const addRooms = (p) => api.post('/assethub/rooms', p).then(d);
export const updateRoom = (id, p) => api.patch(`/assethub/rooms/${id}`, p).then(d);
export const createVendor = (p) => api.post('/assethub/vendors', p).then(d);
export const updateVendor = (id, p) => api.patch(`/assethub/vendors/${id}`, p).then(d);
export const createGlCode = (p) => api.post('/assethub/glcodes', p).then(d);
export const updateGlCode = (id, p) => api.patch(`/assethub/glcodes/${id}`, p).then(d);
export const replaceBands = (bands) => api.put('/assethub/bands', { bands }).then(d);
export const getAssetRoles = () => api.get('/assethub/roles').then(d);
export const addAssetRole = (p) => api.post('/assethub/roles', p).then(d);
export const removeAssetRole = (id) => api.delete(`/assethub/roles/${id}`).then(d);

// asset records + workflow
export const listAssetRecords = (params) => api.get('/assethub/assets', { params }).then(d);
export const getAssetRecord = (id) => api.get(`/assethub/assets/${id}`).then(d);
export const createAssetRecord = (p) => api.post('/assethub/assets', p).then(d);
export const updateAssetRecord = (id, p) => api.patch(`/assethub/assets/${id}`, p).then(d);
export const submitAssetRecord = (id) => api.post(`/assethub/assets/${id}/submit`).then(d);
export const approveAssetRecord = (id, note) => api.post(`/assethub/assets/${id}/approve`, { note }).then(d);
export const sendBackAssetRecord = (id, reason) => api.post(`/assethub/assets/${id}/sendback`, { reason }).then(d);
export const acknowledgeAssetRecord = (id) => api.post(`/assethub/assets/${id}/acknowledge`).then(d);
export const voidAssetRecord = (id, reason) => api.post(`/assethub/assets/${id}/void`, { reason }).then(d);
export const getApprovalQueue = () => api.get('/assethub/approvals').then(d);

// phase 3 — bulk create, legacy import, room assignment
export const bulkCreateAssets = (payload) => api.post('/assethub/assets/bulk', payload).then(d);
export const importLegacyAssets = (payload) => api.post('/assethub/assets/import', payload).then(d);
export const assignAssetRoom = (id, roomId) => api.post(`/assethub/assets/${id}/assign-room`, { roomId }).then(d);
export const bulkAssignRoom = (ids, roomId) => api.post('/assethub/assets/assign-room', { ids, roomId }).then(d);
