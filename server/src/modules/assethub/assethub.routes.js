import { Router } from 'express';
import * as ctrl from './assethub.controller.js';

const router = Router();

// reads (any authenticated user — needed for create-asset forms later)
router.get('/access', ctrl.getAccess);
router.get('/masters', ctrl.getMasters);

// writes (ASSET_ADMIN / ICKU admin only — enforced in the controller)
router.post('/categories', ctrl.createCategory);
router.patch('/categories/:id', ctrl.updateCategory);
router.post('/subcategories', ctrl.createSubCategory);
router.patch('/subcategories/:id', ctrl.updateSubCategory);
router.post('/sites', ctrl.createSite);
router.patch('/sites/:id', ctrl.updateSite);
router.post('/buildings', ctrl.createBuilding);
router.patch('/buildings/:id', ctrl.updateBuilding);
router.post('/rooms', ctrl.addRooms);
router.patch('/rooms/:id', ctrl.updateRoom);
router.post('/vendors', ctrl.createVendor);
router.patch('/vendors/:id', ctrl.updateVendor);
router.post('/glcodes', ctrl.createGlCode);
router.patch('/glcodes/:id', ctrl.updateGlCode);
router.put('/bands', ctrl.replaceBands);
router.get('/roles', ctrl.listRoles);
router.post('/roles', ctrl.addRole);
router.delete('/roles/:id', ctrl.removeRole);

// asset records + workflow
router.get('/approvals', ctrl.approvalQueue);
router.get('/assets', ctrl.listAssets);
router.post('/assets', ctrl.createAsset);
router.post('/assets/bulk', ctrl.bulkCreateAssets);
router.post('/assets/import', ctrl.bulkImportLegacy);
router.post('/assets/assign-room', ctrl.bulkAssignRoom);
router.get('/assets/:id', ctrl.getAsset);
router.patch('/assets/:id', ctrl.updateAsset);
router.post('/assets/:id/submit', ctrl.submitAsset);
router.post('/assets/:id/approve', ctrl.approveAsset);
router.post('/assets/:id/sendback', ctrl.sendBackAsset);
router.post('/assets/:id/acknowledge', ctrl.acknowledgeAsset);
router.post('/assets/:id/void', ctrl.voidAsset);
router.post('/assets/:id/assign-room', ctrl.assignRoom);

// phase 4 — lifecycle events
router.post('/assets/:id/events', ctrl.raiseEvent);
router.post('/assets/:id/repair', ctrl.repairAsset);
router.post('/events/:eventId/approve', ctrl.approveEvent);
router.post('/events/:eventId/reject', ctrl.rejectEvent);

export default router;
