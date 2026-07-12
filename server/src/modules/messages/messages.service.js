import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

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

function shapeMessage(m) {
  return {
    id: m.id,
    body: m.body,
    authorId: m.authorId,
    author: m.author?.name || '—',
    at: m.createdAt,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    mentions: m.mentions || [],
    parentId: m.parentId ?? null,
    replyCount: m._count?.replies,
    lastReplyAt: m.replies?.[0]?.createdAt ?? null,
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
        name: c.type === 'group' ? c.name : other?.name || 'Direct message',
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
      };
    })
  );

  return rows.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

export async function getConversation(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { include: { user: { select: { id: true, name: true, designation: true } } } } },
  });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  if (!conv.members.some((m) => m.userId === userId)) throw new ApiError(403, 'Not a member');
  const other = conv.type === 'dm' ? conv.members.find((m) => m.userId !== userId)?.user : null;
  return {
    id: conv.id,
    type: conv.type,
    name: conv.type === 'group' ? conv.name : other?.name || 'Direct message',
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
  await loadMembership(userId, conversationId);
  const msgs = await prisma.message.findMany({
    where: { conversationId, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true } },
      _count: { select: { replies: true } },
      replies: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  return msgs.map(shapeMessage);
}

// A single message's thread: the parent plus its replies.
export async function listThread(userId, messageId) {
  const parent = await prisma.message.findUnique({
    where: { id: messageId },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!parent) throw new ApiError(404, 'Message not found');
  await loadMembership(userId, parent.conversationId);
  const replies = await prisma.message.findMany({
    where: { parentId: messageId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true } } },
  });
  return { parent: shapeMessage(parent), replies: replies.map(shapeMessage) };
}

export async function postMessage(userId, conversationId, { body = '', parentId = null, attachments = null, mentions = [] } = {}) {
  await loadMembership(userId, conversationId);
  const text = (body || '').trim();
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && a.url) : [];
  if (!text && atts.length === 0) throw new ApiError(400, 'Message cannot be empty');
  if (parentId) {
    const parent = await prisma.message.findUnique({ where: { id: parentId }, select: { conversationId: true } });
    if (!parent || parent.conversationId !== conversationId) throw new ApiError(400, 'Invalid thread parent');
  }
  const msg = await prisma.message.create({
    data: {
      conversationId,
      authorId: userId,
      body: text,
      parentId: parentId || null,
      attachments: atts.length ? atts : undefined,
      mentions: Array.isArray(mentions) ? mentions.filter(Boolean) : [],
    },
    include: { author: { select: { id: true, name: true } } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return shapeMessage(msg);
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
