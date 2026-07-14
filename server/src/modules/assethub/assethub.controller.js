import * as service from './assethub.service.js';
import * as assets from './assets.service.js';
import * as verify from './verification.service.js';

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

// ── asset records + workflow (role checks live in the service) ──────
export const listAssets = read((req) => assets.listAssets(req.user, req.query));
export const getAsset = read((req) => assets.getAsset(req.user, req.params.id));
export const createAsset = read((req) => assets.createAsset(req.user, req.body || {}));
export const updateAsset = read((req) => assets.updateAsset(req.user, req.params.id, req.body || {}));
export const submitAsset = read((req) => assets.submitAsset(req.user, req.params.id));
export const approveAsset = read((req) => assets.approveAsset(req.user, req.params.id, req.body?.note));
export const sendBackAsset = read((req) => assets.sendBack(req.user, req.params.id, req.body?.reason));
export const acknowledgeAsset = read((req) => assets.acknowledgeAsset(req.user, req.params.id));
export const voidAsset = read((req) => assets.voidAsset(req.user, req.params.id, req.body?.reason));
export const approvalQueue = read((req) => assets.approvalQueue(req.user));

// phase 3 — bulk create, legacy import, room assignment
export const bulkCreateAssets = read((req) => assets.bulkCreateAssets(req.user, req.body || {}));
export const bulkImportLegacy = read((req) => assets.bulkImportLegacy(req.user, req.body || {}));
export const assignRoom = read((req) => assets.assignRoom(req.user, req.params.id, req.body?.roomId || null));
export const bulkAssignRoom = read((req) => assets.bulkAssignRoom(req.user, req.body || {}));

// phase 4 — lifecycle events
export const raiseEvent = read((req) => assets.raiseEvent(req.user, req.params.id, req.body || {}));
export const approveEvent = read((req) => assets.approveEvent(req.user, req.params.eventId, req.body?.note));
export const rejectEvent = read((req) => assets.rejectEvent(req.user, req.params.eventId, req.body?.reason));
export const repairAsset = read((req) => assets.repairAsset(req.user, req.params.id, req.body?.note));

// phase 5 — physical verification
export const listVerifications = read((req) => verify.listSessions(req.user));
export const getVerification = read((req) => verify.getSession(req.user, req.params.id));
export const createVerification = read((req) => verify.createSession(req.user, req.body || {}));
export const markVerifyLine = read((req) => verify.markLine(req.user, req.params.id, req.params.lineId, req.body || {}));
export const setVerifyCount = read((req) => verify.setCount(req.user, req.params.id, req.params.countId, req.body?.actual));
export const resolveVerifyLine = read((req) => verify.resolveLine(req.user, req.params.id, req.params.lineId));
export const closeVerification = read((req) => verify.closeSession(req.user, req.params.id));
