import { Router } from 'express';
import * as ctrl from './messages.controller.js';

const router = Router();

// Conversation list (groups + DMs) for the sidebar
router.get('/conversations', ctrl.listConversations);

// Create a group / open a DM
router.post('/groups', ctrl.createGroup);
router.post('/groups/:id/members', ctrl.addMembers);
router.post('/dm/:userId', ctrl.openDm);

// A single conversation + its messages
router.get('/conversations/:id', ctrl.getConversation);
router.get('/conversations/:id/messages', ctrl.listMessages);
router.post('/conversations/:id/messages', ctrl.postMessage);
router.post('/conversations/:id/read', ctrl.markRead);

// Thread (a message's replies)
router.get('/thread/:messageId', ctrl.listThread);

export default router;
