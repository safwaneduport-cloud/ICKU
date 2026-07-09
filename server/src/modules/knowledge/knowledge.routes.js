import { Router } from 'express';
import * as ctrl from './knowledge.controller.js';

const router = Router();

router.get('/meta', ctrl.getMeta);
router.get('/', ctrl.list); // ?type&dept&q
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);

export default router;
