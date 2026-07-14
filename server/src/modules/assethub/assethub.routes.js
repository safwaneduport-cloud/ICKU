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

export default router;
