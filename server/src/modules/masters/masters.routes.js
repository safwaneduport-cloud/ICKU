import { Router } from 'express';
import * as ctrl from './masters.controller.js';

const router = Router();

router.get('/types', ctrl.getTypes);                 // HR: type list + counts
router.get('/:type/admin', ctrl.getAdminOptions);    // HR: options + usage + search
router.get('/:type', ctrl.getActiveOptions);         // anyone: active values (dropdowns)
router.post('/:type', ctrl.create);                  // HR: create option
router.patch('/option/:id', ctrl.update);            // HR: rename / activate / deactivate
router.delete('/option/:id', ctrl.remove);           // HR: delete (blocked if in use)

export default router;
