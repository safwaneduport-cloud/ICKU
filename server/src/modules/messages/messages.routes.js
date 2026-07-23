import { Router } from 'express';
import * as ctrl from './messages.controller.js';

const router = Router();

// Conversation list (groups + DMs) for the sidebar
router.get('/conversations', ctrl.listConversations);

// Create a group / open a DM
router.post('/groups', ctrl.createGroup);
router.post('/groups/:id/members', ctrl.addMembers);
router.post('/dm/:userId', ctrl.openDm);
router.post('/event/:eventId', ctrl.openEventConversation);

// A single conversation + its messages
router.get('/conversations/:id', ctrl.getConversation);
router.get('/conversations/:id/messages', ctrl.listMessages);
router.post('/conversations/:id/messages', ctrl.postMessage);
router.post('/conversations/:id/read', ctrl.markRead);
router.post('/conversations/:id/unread', ctrl.markUnread); // mark unread from a message
router.patch('/conversations/:id/section', ctrl.setSection);

// Threads I'm part of (Threads card) — before the '/thread/:messageId' param route
router.get('/threads/mine', ctrl.myThreads);
// Files shared across my conversations (Files tab)
router.get('/files', ctrl.listFiles);
// Search message bodies across my conversations
router.get('/search', ctrl.searchMessages);
// Thread (a message's replies)
router.get('/thread/:messageId', ctrl.listThread);

// Single-message actions (edit / delete / react)
router.patch('/message/:messageId', ctrl.editMessage);
router.delete('/message/:messageId', ctrl.deleteMessage);
router.post('/message/:messageId/react', ctrl.reactMessage);

// Reminders ("Remind me")
router.get('/reminders', ctrl.listReminders);
router.post('/reminders', ctrl.createReminder);
router.post('/reminders/:id/complete', ctrl.completeReminder);
router.delete('/reminders/:id', ctrl.deleteReminder);

export default router;
