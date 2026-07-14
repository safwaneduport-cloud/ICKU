import * as service from './assethub.service.js';

const ok = (res, data) => res.json({ data, error: null });

// wrap: plain read
const read = (fn) => async (req, res, next) => {
  try { ok(res, await fn(req)); } catch (e) { next(e); }
};
// wrap: admin-gated write
const write = (fn) => async (req, res, next) => {
  try { await service.assertAssetAdmin(req.user); ok(res, await fn(req)); } catch (e) { next(e); }
};

export const getAccess = read((req) => service.myAccess(req.user));
export const getMasters = read(() => service.allMasters());

export const createCategory = write((req) => service.createCategory(req.body || {}));
export const updateCategory = write((req) => service.updateCategory(req.params.id, req.body || {}));
export const createSubCategory = write((req) => service.createSubCategory(req.body || {}));
export const updateSubCategory = write((req) => service.updateSubCategory(req.params.id, req.body || {}));
export const createSite = write((req) => service.createSite(req.body || {}));
export const updateSite = write((req) => service.updateSite(req.params.id, req.body || {}));
export const createBuilding = write((req) => service.createBuilding(req.body || {}));
export const updateBuilding = write((req) => service.updateBuilding(req.params.id, req.body || {}));
export const addRooms = write((req) => service.addRooms(req.body || {}));
export const updateRoom = write((req) => service.updateRoom(req.params.id, req.body || {}));
export const createVendor = write((req) => service.createVendor(req.body || {}));
export const updateVendor = write((req) => service.updateVendor(req.params.id, req.body || {}));
export const createGlCode = write((req) => service.createGlCode(req.body || {}));
export const updateGlCode = write((req) => service.updateGlCode(req.params.id, req.body || {}));
export const replaceBands = write((req) => service.replaceBands(req.body?.bands));
export const listRoles = write(() => service.listRoles());
export const addRole = write((req) => service.addRole(req.body || {}));
export const removeRole = write((req) => service.removeRole(req.params.id));
