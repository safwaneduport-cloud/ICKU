import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { notifyMention } from '../../lib/notify.js';

// ── helpers ──────────────────────────────────────────────────────────
async function loadMembership(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  if (!conv.members.some((m) => m.userId === userId)) {
    throw new ApiError(403, 'You are not a member of this conversation');
  }
  return conv;
}

// Read access: members always; anyone may read an EVENT conversation (event
// chats are open to whoever can see the event — joining happens on posting).
async function loadForRead(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  const isMember = conv.members.some((m) => m.userId === userId);
  if (!isMember && conv.type !== 'event') {
    throw new ApiError(403, 'You are not a member of this conversation');
  }
  return conv;
}

// What listMessages / listThread need to shape a full message.
const MSG_INCLUDE = {
  author: { select: { id: true, name: true } },
  _count: { select: { replies: true } },
  replies: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  reactions: { select: { userId: true, emoji: true } },
};

function groupReactions(list = [], meId) {
  const map = new Map();
  for (const r of list) {
    const e = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    e.count += 1;
    if (r.userId === meId) e.mine = true;
    map.set(r.emoji, e);
  }
  return [...map.values()];
}

function shapeMessage(m, meId) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    body: deleted ? '' : m.body,
    authorId: m.authorId,
    author: m.author?.name || '—',
    at: m.createdAt,
    attachments: deleted ? [] : (Array.isArray(m.attachments) ? m.attachments : []),
    mentions: m.mentions || [],
    parentId: m.parentId ?? null,
    replyCount: m._count?.replies,
    lastReplyAt: m.replies?.[0]?.createdAt ?? null,
    editedAt: m.editedAt ?? null,
    deleted,
    reactions: deleted ? [] : groupReactions(m.reactions, meId),
  };
}

// ── conversations ────────────────────────────────────────────────────

// All conversations I'm a member of (groups + DMs), most-recent-first,
// each with a display name, last message and unread count.
export async function listConversations(userId) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { author: { select: { name: true } } },
          },
        },
      },
    },
  });

  const rows = await Promise.all(
    memberships.map(async (m) => {
      const c = m.conversation;
      const other = c.type === 'dm' ? c.members.find((x) => x.userId !== userId)?.user : null;
      const last = c.messages[0] || null;
      const unread = await prisma.message.count({
        where: {
          conversationId: c.id,
          authorId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      return {
        id: c.id,
        type: c.type,
        eventId: c.eventId,
        name: c.type === 'dm' ? other?.name || 'Direct message' : c.name,
        memberCount: c.members.length,
        lastMessage: last
          ? {
              author: last.author.name,
              body: last.body,
              at: last.createdAt,
              hasAttachments: Array.isArray(last.attachments) && last.attachments.length > 0,
            }
          : null,
        lastAt: last?.createdAt || c.createdAt,
        unread,
        section: m.section || null,
      };
    })
  );

  return rows.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

// Set (or clear) the requesting member's personal section for a conversation.
export async function setSection(userId, conversationId, section) {
  const clean = (section || '').trim().slice(0, 40) || null;
  const m = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!m) throw new ApiError(404, 'Not a member of this conversation');
  await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { section: clean } });
  return { ok: true, section: clean };
}

export async function getConversation(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { include: { user: { select: { id: true, name: true, designation: true } } } } },
  });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  const isMember = conv.members.some((m) => m.userId === userId);
  if (!isMember && conv.type !== 'event') throw new ApiError(403, 'Not a member');
  const other = conv.type === 'dm' ? conv.members.find((m) => m.userId !== userId)?.user : null;
  return {
    id: conv.id,
    type: conv.type,
    eventId: conv.eventId,
    name: conv.type === 'dm' ? other?.name || 'Direct message' : conv.name,
    createdById: conv.createdById,
    members: conv.members.map((m) => ({
      id: m.userId,
      name: m.user.name,
      designation: m.user.designation,
      role: m.role,
    })),
  };
}

export async function createGroup(userId, name, memberIds = []) {
  const clean = (name || '').trim();
  if (!clean) throw new ApiError(400, 'Group name is required');
  const ids = Array.from(new Set([userId, ...memberIds])); // creator always included
  return prisma.conversation.create({
    data: {
      type: 'group',
      name: clean,
      createdById: userId,
      members: { create: ids.map((id) => ({ userId: id, role: id === userId ? 'owner' : 'member' })) },
    },
    select: { id: true },
  });
}

export async function addMembers(userId, conversationId, memberIds = []) {
  const conv = await loadMembership(userId, conversationId);
  if (conv.type !== 'group') throw new ApiError(400, 'Members can only be added to groups');
  const existing = new Set(conv.members.map((m) => m.userId));
  const toAdd = (memberIds || []).filter((id) => id && !existing.has(id));
  if (toAdd.length) {
    await prisma.conversationMember.createMany({
      data: toAdd.map((id) => ({ conversationId, userId: id, role: 'member' })),
      skipDuplicates: true,
    });
  }
  return getConversation(userId, conversationId);
}

// Find (or create) the 1:1 DM between me and another user.
export async function openDm(userId, otherId) {
  if (userId === otherId) throw new ApiError(400, 'You cannot message yourself');
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other) throw new ApiError(404, 'User not found');

  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'dm',
      AND: [{ members: { some: { userId } } }, { members: { some: { userId: otherId } } }],
    },
    include: { members: true },
  });
  if (existing && existing.members.length === 2) return { id: existing.id };

  const conv = await prisma.conversation.create({
    data: {
      type: 'dm',
      createdById: userId,
      members: { create: [{ userId }, { userId: otherId }] },
    },
    select: { id: true },
  });
  return conv;
}

// ── messages ─────────────────────────────────────────────────────────

// Top-level messages of a conversation (with reply counts for threads).
export async function listMessages(userId, conversationId) {
  await loadForRead(userId, conversationId);
  const msgs = await prisma.message.findMany({
    where: { conversationId, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: MSG_INCLUDE,
  });
  return msgs.map((m) => shapeMessage(m, userId));
}

// A single message's thread: the parent plus its replies.
export async function listThread(userId, messageId) {
  const parent = await prisma.message.findUnique({ where: { id: messageId }, include: MSG_INCLUDE });
  if (!parent) throw new ApiError(404, 'Message not found');
  await loadForRead(userId, parent.conversationId);
  const replies = await prisma.message.findMany({
    where: { parentId: messageId },
    orderBy: { createdAt: 'asc' },
    include: MSG_INCLUDE,
  });
  return { parent: shapeMessage(parent, userId), replies: replies.map((r) => shapeMessage(r, userId)) };
}

export async function postMessage(userId, conversationId, { body = '', parentId = null, attachments = null, mentions = [] } = {}) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { members: true } });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  const isMember = conv.members.some((m) => m.userId === userId);
  if (!isMember) {
    // Posting to an event chat joins you (so it lands in your Event Messages);
    // for groups/DMs, non-members are rejected.
    if (conv.type === 'event') {
      await prisma.conversationMember.create({ data: { conversationId, userId, role: 'member' } }).catch(() => {});
    } else {
      throw new ApiError(403, 'You are not a member of this conversation');
    }
  }

  const text = (body || '').trim();
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && a.url) : [];
  if (!text && atts.length === 0) throw new ApiError(400, 'Message cannot be empty');
  if (parentId) {
    const parent = await prisma.message.findUnique({ where: { id: parentId }, select: { conversationId: true } });
    if (!parent || parent.conversationId !== conversationId) throw new ApiError(400, 'Invalid thread parent');
  }

  const cleanMentions = Array.isArray(mentions) ? mentions.filter(Boolean) : [];
  const msg = await prisma.message.create({
    data: {
      conversationId,
      authorId: userId,
      body: text,
      parentId: parentId || null,
      attachments: atts.length ? atts : undefined,
      mentions: cleanMentions,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  // @-mention routing: in an event chat, mentioned people become members so the
  // conversation surfaces in their Event Messages inbox.
  if (conv.type === 'event' && cleanMentions.length) {
    const already = new Set(conv.members.map((m) => m.userId).concat(userId));
    const toAdd = cleanMentions.filter((id) => !already.has(id));
    if (toAdd.length) {
      await prisma.conversationMember.createMany({
        data: toAdd.map((id) => ({ conversationId, userId: id, role: 'member' })),
        skipDuplicates: true,
      });
    }
  }

  // Email real @-mentions (skip @channel/@all markers and self — those would
  // mass-mail a channel; members still get the in-app unread bell).
  const mentioned = cleanMentions.filter((m) => !m.startsWith('@') && m !== userId);
  const where = conv.type === 'dm' ? 'a direct message' : conv.name;
  for (const uid of mentioned) notifyMention(uid, { by: msg.author.name, where, snippet: text });

  return shapeMessage(msg, userId);
}

// ── edit / delete / react ────────────────────────────────────────────
export async function editMessage(userId, messageId, body) {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m) throw new ApiError(404, 'Message not found');
  if (m.authorId !== userId) throw new ApiError(403, 'You can only edit your own messages');
  if (m.deletedAt) throw new ApiError(400, 'This message was deleted');
  const text = (body || '').trim();
  if (!text) throw new ApiError(400, 'Message cannot be empty');
  const updated = await prisma.message.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() }, include: MSG_INCLUDE });
  return shapeMessage(updated, userId);
}

export async function deleteMessage(userId, messageId) {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m) throw new ApiError(404, 'Message not found');
  if (m.authorId !== userId) throw new ApiError(403, 'You can only delete your own messages');
  if (m.deletedAt) return { ok: true };
  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: '' } });
  await prisma.messageReaction.deleteMany({ where: { messageId } });
  return { ok: true };
}

export async function toggleReaction(userId, messageId, emoji) {
  const clean = (emoji || '').trim();
  if (!clean) throw new ApiError(400, 'An emoji is required');
  const m = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedAt: true } });
  if (!m) throw new ApiError(404, 'Message not found');
  if (m.deletedAt) throw new ApiError(400, 'This message was deleted');
  await loadForRead(userId, m.conversationId);
  const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji: clean } } });
  if (existing) await prisma.messageReaction.delete({ where: { id: existing.id } });
  else await prisma.messageReaction.create({ data: { messageId, userId, emoji: clean } });
  const list = await prisma.messageReaction.findMany({ where: { messageId }, select: { userId: true, emoji: true } });
  return groupReactions(list, userId);
}

// ── reminders ("Remind me") ──────────────────────────────────────────
export async function createReminder(userId, { messageId = null, conversationId = null, text = '', remindAt } = {}) {
  const when = new Date(remindAt);
  if (Number.isNaN(when.getTime())) throw new ApiError(400, 'Invalid reminder time');
  let convId = conversationId;
  let snippet = (text || '').trim();
  if (messageId) {
    const m = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, body: true } });
    if (!m) throw new ApiError(404, 'Message not found');
    convId = m.conversationId;
    if (!snippet) snippet = m.body ? m.body.slice(0, 140) : 'a message';
  }
  if (!snippet) snippet = 'Reminder';
  return prisma.reminder.create({ data: { userId, messageId, conversationId: convId, text: snippet, remindAt: when } });
}

export async function listReminders(userId) {
  const rows = await prisma.reminder.findMany({ where: { userId, doneAt: null }, orderBy: { remindAt: 'asc' } });
  const now = Date.now();
  return rows.map((r) => ({ ...r, due: new Date(r.remindAt).getTime() <= now }));
}

// Reminders that have come due — surfaced in the notification bell.
export async function dueReminders(userId) {
  return prisma.reminder.findMany({
    where: { userId, doneAt: null, remindAt: { lte: new Date() } },
    orderBy: { remindAt: 'asc' },
  });
}

export async function completeReminder(userId, id) {
  const r = await prisma.reminder.findUnique({ where: { id } });
  if (!r || r.userId !== userId) throw new ApiError(404, 'Reminder not found');
  await prisma.reminder.update({ where: { id }, data: { doneAt: new Date() } });
  return { ok: true };
}

export async function deleteReminder(userId, id) {
  const r = await prisma.reminder.findUnique({ where: { id } });
  if (!r || r.userId !== userId) throw new ApiError(404, 'Reminder not found');
  await prisma.reminder.delete({ where: { id } });
  return { ok: true };
}

// Find (or create) the chat conversation for an event. Members start as the
// event owner + all task assignees; more people join by posting or being @-ed.
export async function openEventConversation(userId, eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { tasks: { include: { assignees: { select: { userId: true } } } } },
  });
  if (!event) throw new ApiError(404, 'Project not found');

  const existing = await prisma.conversation.findUnique({ where: { eventId }, select: { id: true } });
  if (existing) return existing;

  const creator = event.ownerId || userId;
  const memberIds = new Set([creator]);
  if (event.ownerId) memberIds.add(event.ownerId);
  event.tasks.forEach((t) => t.assignees.forEach((a) => memberIds.add(a.userId)));

  return prisma.conversation.create({
    data: {
      type: 'event',
      name: event.name,
      eventId,
      createdById: creator,
      members: { create: Array.from(memberIds).map((id) => ({ userId: id, role: id === creator ? 'owner' : 'member' })) },
    },
    select: { id: true },
  });
}

export async function markRead(userId, conversationId) {
  await prisma.conversationMember
    .update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    })
    .catch(() => {});
  return { ok: true };
}
