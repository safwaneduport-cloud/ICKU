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
  author: { select: { id: true, name: true, photoUrl: true } },
  _count: { select: { replies: true } },
  // Recent replies: last one drives lastReplyAt; the set drives the Slack-style
  // stack of replier avatars on the thread indicator (deduped, capped at 3).
  replies: { orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, authorId: true, author: { select: { id: true, name: true, photoUrl: true } } } },
  reactions: { select: { userId: true, emoji: true, user: { select: { name: true } } } },
};

function groupReactions(list = [], meId) {
  const map = new Map();
  for (const r of list) {
    const e = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, who: [] };
    e.count += 1;
    if (r.userId === meId) { e.mine = true; e.who.unshift('You'); }
    else if (r.user?.name) e.who.push(r.user.name);
    map.set(r.emoji, e);
  }
  return [...map.values()];
}

// Up to 3 distinct authors from the recent replies, most-recent first — the
// avatars shown on the "N replies" thread indicator (Slack-style).
function distinctReplyAuthors(replies) {
  const out = [];
  const seen = new Set();
  for (const r of replies || []) {
    if (!r.author || seen.has(r.authorId)) continue;
    seen.add(r.authorId);
    out.push({ id: r.author.id, name: r.author.name, photoUrl: r.author.photoUrl ?? null });
    if (out.length >= 3) break;
  }
  return out;
}

function shapeMessage(m, meId) {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    body: deleted ? '' : m.body,
    authorId: m.authorId,
    author: m.author?.name || '—',
    authorPhoto: m.author?.photoUrl ?? null,
    at: m.createdAt,
    attachments: deleted ? [] : (Array.isArray(m.attachments) ? m.attachments : []),
    mentions: m.mentions || [],
    parentId: m.parentId ?? null,
    replyCount: m._count?.replies,
    lastReplyAt: m.replies?.[0]?.createdAt ?? null,
    replyAuthors: distinctReplyAuthors(m.replies),
    editedAt: m.editedAt ?? null,
    deleted,
    pinnedAt: m.pinnedAt ?? null,
    pinnedById: m.pinnedById ?? null,
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
          members: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
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
        photoUrl: other?.photoUrl ?? null, // DM partner avatar (null for groups/events)
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
        muted: !!m.mutedAt,
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

// Mute / unmute a conversation for this member (personal — no unread badge).
export async function setMute(userId, conversationId, muted) {
  const m = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!m) throw new ApiError(404, 'Not a member of this conversation');
  await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { mutedAt: muted ? new Date() : null } });
  return { ok: true, muted: !!muted };
}

// Set a group/event conversation's description (shared; DMs have none).
export async function setDescription(userId, conversationId, description) {
  const conv = await loadForRead(userId, conversationId); // members only
  if (conv.type === 'dm') throw new ApiError(400, 'Direct messages have no description');
  const clean = (description || '').trim().slice(0, 500) || null;
  await prisma.conversation.update({ where: { id: conversationId }, data: { description: clean } });
  return { ok: true, description: clean };
}

export async function getConversation(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { include: { user: { select: { id: true, name: true, designation: true, photoUrl: true } } } } },
  });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  const isMember = conv.members.some((m) => m.userId === userId);
  if (!isMember && conv.type !== 'event') throw new ApiError(403, 'Not a member');
  const other = conv.type === 'dm' ? conv.members.find((m) => m.userId !== userId)?.user : null;
  const meMember = conv.members.find((m) => m.userId === userId);
  return {
    id: conv.id,
    type: conv.type,
    eventId: conv.eventId,
    name: conv.type === 'dm' ? other?.name || 'Direct message' : conv.name,
    photoUrl: other?.photoUrl ?? null,
    createdById: conv.createdById,
    description: conv.description ?? null,
    muted: !!meMember?.mutedAt,
    lastReadAt: meMember?.lastReadAt ?? null, // where the "New messages" divider goes (frozen client-side on open)
    members: conv.members.map((m) => ({
      id: m.userId,
      name: m.user.name,
      designation: m.user.designation,
      photoUrl: m.user.photoUrl ?? null,
      role: m.role,
    })),
  };
}

export async function createGroup(userId, name, memberIds = []) {
  // Group names are stored lowercase (like Slack channels) so they're quick to
  // scan and there's one canonical form.
  const clean = (name || '').trim().toLowerCase();
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

// Remove someone else from a group (any member can; not for DMs; use leave for self).
export async function removeMember(userId, conversationId, targetUserId) {
  const conv = await loadMembership(userId, conversationId);
  if (conv.type !== 'group') throw new ApiError(400, 'Members can only be removed from groups');
  if (targetUserId === userId) throw new ApiError(400, 'Use “leave” to remove yourself');
  await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: targetUserId } } }).catch(() => {});
  return getConversation(userId, conversationId);
}

// Leave a conversation (groups and event chats; you can't leave a DM).
export async function leaveConversation(userId, conversationId) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (!conv) throw new ApiError(404, 'Conversation not found');
  if (conv.type === 'dm') throw new ApiError(400, "You can't leave a direct message");
  await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } }).catch(() => {});
  return { ok: true };
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
// Paginated top-level messages, always returned oldest→newest for display.
//  - default: the most recent `limit`
//  - before=<id>: the `limit` messages strictly older than that message
//  - focus=<id>: a window centred on that message (for jump-to from search/pins)
// Returns { messages, hasMore } where hasMore = older messages exist beyond the
// oldest one returned (drives the "Load older" affordance).
export async function listMessages(userId, conversationId, { before = null, focus = null, limit = 50 } = {}) {
  await loadForRead(userId, conversationId);
  const base = { conversationId, parentId: null };
  const lim = Math.min(Math.max(Number(limit) || 50, 10), 100);
  // keyset "older than message X": strictly-older createdAt, or same instant + lower id
  const olderThan = (at, id) => ({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] });
  let rows;

  if (focus) {
    const t = await prisma.message.findUnique({ where: { id: focus }, select: { createdAt: true, conversationId: true } });
    if (!t || t.conversationId !== conversationId) {
      rows = [];
    } else {
      const half = Math.floor(lim / 2);
      const olderRows = await prisma.message.findMany({ where: { ...base, ...olderThan(t.createdAt, focus) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: half, include: MSG_INCLUDE });
      const fromTarget = await prisma.message.findMany({ where: { ...base, OR: [{ createdAt: { gt: t.createdAt } }, { createdAt: t.createdAt, id: { gte: focus } }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: half + 1, include: MSG_INCLUDE });
      rows = [...olderRows.reverse(), ...fromTarget];
    }
  } else if (before) {
    const c = await prisma.message.findUnique({ where: { id: before }, select: { createdAt: true } });
    rows = c
      ? (await prisma.message.findMany({ where: { ...base, ...olderThan(c.createdAt, before) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: lim, include: MSG_INCLUDE })).reverse()
      : [];
  } else {
    rows = (await prisma.message.findMany({ where: base, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: lim, include: MSG_INCLUDE })).reverse();
  }

  let hasMore = false;
  if (rows.length) {
    const o = rows[0];
    hasMore = (await prisma.message.count({ where: { ...base, ...olderThan(o.at ?? o.createdAt, o.id) } })) > 0;
  }
  return { messages: rows.map((m) => shapeMessage(m, userId)), hasMore };
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

// Threads the signed-in user is part of: top-level messages that have replies,
// in conversations they can see, where they authored the root, replied, or were
// @mentioned. Most recently active thread first (drives the "Threads" card).
export async function myThreads(userId) {
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  const convIds = memberships.map((m) => m.conversationId);
  if (!convIds.length) return [];
  const parents = await prisma.message.findMany({
    where: {
      parentId: null,
      deletedAt: null,
      conversationId: { in: convIds },
      replies: { some: {} },
      OR: [
        { authorId: userId },
        { mentions: { has: userId } },
        { replies: { some: { authorId: userId } } },
        { replies: { some: { mentions: { has: userId } } } },
      ],
    },
    include: { ...MSG_INCLUDE, conversation: { select: { id: true, type: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  // Per-thread unread (Slack-style): a reply from someone else, newer than my
  // read baseline, counts as unread. Baseline = max(my ThreadRead.lastReadAt, my
  // most recent own post in the thread). Replying or opening the thread advances
  // lastReadAt; my own posts never count against me.
  const rootIds = parents.map((p) => p.id);
  const [reads, replies] = await Promise.all([
    prisma.threadRead.findMany({ where: { userId, messageId: { in: rootIds } }, select: { messageId: true, lastReadAt: true } }),
    prisma.message.findMany({ where: { parentId: { in: rootIds }, deletedAt: null }, select: { parentId: true, authorId: true, createdAt: true } }),
  ]);
  const readAt = new Map(reads.map((r) => [r.messageId, new Date(r.lastReadAt).getTime()]));
  const myLast = new Map(); // rootId -> ms of my most recent post in the thread (root or reply)
  const bump = (id, at) => { const t = new Date(at).getTime(); if (t > (myLast.get(id) || 0)) myLast.set(id, t); };
  for (const p of parents) if (p.authorId === userId) bump(p.id, p.createdAt);
  for (const r of replies) if (r.authorId === userId) bump(r.parentId, r.createdAt);
  const unread = new Map(); // rootId -> count of others' replies newer than my baseline
  for (const r of replies) {
    if (r.authorId === userId) continue;
    const baseline = Math.max(readAt.get(r.parentId) || 0, myLast.get(r.parentId) || 0);
    if (new Date(r.createdAt).getTime() > baseline) unread.set(r.parentId, (unread.get(r.parentId) || 0) + 1);
  }

  const shaped = parents.map((m) => ({
    ...shapeMessage(m, userId),
    conversationId: m.conversationId,
    conversationName: m.conversation.name || (m.conversation.type === 'dm' ? 'Direct message' : ''),
    conversationType: m.conversation.type,
    unreadCount: unread.get(m.id) || 0,
    hasUnread: (unread.get(m.id) || 0) > 0,
  }));
  // Unread threads first, then most-recently-active.
  shaped.sort((a, b) => (b.hasUnread ? 1 : 0) - (a.hasUnread ? 1 : 0) || new Date(b.lastReplyAt || b.at) - new Date(a.lastReplyAt || a.at));
  return shaped;
}

// Mark a thread read for this user (upserts lastReadAt = now). Only thread ROOTS
// are tracked; opening a thread or posting a reply advances this.
export async function markThreadRead(userId, messageId) {
  const root = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, parentId: true, conversationId: true } });
  if (!root) throw new ApiError(404, 'Thread not found');
  if (root.parentId) throw new ApiError(400, 'Not a thread root');
  await loadForRead(userId, root.conversationId); // membership / read access
  const now = new Date();
  await prisma.threadRead.upsert({
    where: { userId_messageId: { userId, messageId } },
    create: { userId, messageId, lastReadAt: now },
    update: { lastReadAt: now },
  });
  return { ok: true };
}

// Every file/image shared in the conversations I'm part of — powers the "Files"
// tab. Flattened so one message with several attachments yields several rows,
// newest first.
export async function filesFor(userId) {
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  const convIds = memberships.map((m) => m.conversationId);
  if (!convIds.length) return [];
  const msgs = await prisma.message.findMany({
    where: { conversationId: { in: convIds }, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, photoUrl: true } },
      conversation: { select: { id: true, type: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  const files = [];
  for (const m of msgs) {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    atts.forEach((a, i) => {
      if (!a || !a.url) return;
      files.push({
        id: `${m.id}:${i}`,
        kind: a.kind === 'image' ? 'image' : 'file',
        name: a.name || 'file',
        url: a.url,
        at: m.createdAt,
        author: m.author?.name || '—',
        authorId: m.authorId,
        conversationId: m.conversationId,
        conversationName: m.conversation.name || (m.conversation.type === 'dm' ? 'Direct message' : ''),
        conversationType: m.conversation.type,
      });
    });
  }
  return files.slice(0, 120);
}

// A short snippet windowed around the first occurrence of `term`, with ellipses.
function snippetAround(body = '', term = '') {
  const i = body.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return body.slice(0, 160) + (body.length > 160 ? '…' : '');
  const start = Math.max(0, i - 30);
  const end = Math.min(body.length, i + term.length + 120);
  return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
}

// Substring search over message bodies in the conversations I'm a member of.
export async function searchMessages(userId, q) {
  const raw = Array.isArray(q) ? q[0] : q; // a duplicate ?q= param arrives as an array
  const term = (typeof raw === 'string' ? raw : '').trim();
  if (term.length < 2) return [];
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  const convIds = memberships.map((m) => m.conversationId);
  if (!convIds.length) return [];
  // Escape LIKE metacharacters so '%' / '_' match literally instead of as wildcards.
  const esc = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const msgs = await prisma.message.findMany({
    where: { conversationId: { in: convIds }, deletedAt: null, body: { contains: esc, mode: 'insensitive' } },
    include: {
      author: { select: { name: true } },
      conversation: { select: { type: true, name: true, members: { select: { userId: true, user: { select: { name: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return msgs.map((m) => {
    const c = m.conversation;
    const other = c.type === 'dm' ? c.members.find((mm) => mm.userId !== userId)?.user : null;
    return {
      id: m.id,
      conversationId: m.conversationId,
      conversationName: c.type === 'dm' ? other?.name || 'Direct message' : c.name || '',
      conversationType: c.type,
      author: m.author?.name || '—',
      snippet: snippetAround(m.body, term),
      at: m.createdAt,
    };
  });
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
  // Keep uploads (which carry a url) and forwarded-message cards (kind 'forward',
  // which carry the quoted original instead of a url).
  const atts = Array.isArray(attachments) ? attachments.filter((a) => a && (a.url || a.kind === 'forward')) : [];
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

  // Replying to a thread marks it read for me up to now (my own reply never shows
  // as unread, and I'm caught up on everything before it).
  if (parentId) {
    await prisma.threadRead.upsert({
      where: { userId_messageId: { userId, messageId: parentId } },
      create: { userId, messageId: parentId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    }).catch(() => {});
  }

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

// Pin / unpin a message to its conversation. Any member can pin (Slack-style).
export async function setPin(userId, messageId, pinned) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, conversationId: true, deletedAt: true } });
  if (!m) throw new ApiError(404, 'Message not found');
  if (m.deletedAt) throw new ApiError(400, 'Cannot pin a deleted message');
  await loadForRead(userId, m.conversationId); // membership check (403 for non-members)
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: pinned ? { pinnedAt: new Date(), pinnedById: userId } : { pinnedAt: null, pinnedById: null },
    include: MSG_INCLUDE,
  });
  return shapeMessage(updated, userId);
}

// The pinned messages of a conversation, most-recently-pinned first.
export async function listPinned(userId, conversationId) {
  await loadForRead(userId, conversationId);
  const msgs = await prisma.message.findMany({
    where: { conversationId, pinnedAt: { not: null }, deletedAt: null },
    orderBy: { pinnedAt: 'desc' },
    include: MSG_INCLUDE,
  });
  return msgs.map((m) => shapeMessage(m, userId));
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

// Mark a conversation unread starting at a given message: set lastReadAt to just
// before it, so that message and everything after it count as unread again.
export async function markUnread(userId, conversationId, messageId) {
  if (!messageId) throw new ApiError(400, 'messageId is required');
  const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { createdAt: true, conversationId: true } });
  if (!msg || msg.conversationId !== conversationId) throw new ApiError(400, 'Message is not in this conversation');
  await prisma.conversationMember
    .update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date(msg.createdAt.getTime() - 1) },
    })
    .catch(() => {});
  return { ok: true };
}
