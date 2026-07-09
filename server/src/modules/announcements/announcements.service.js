import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export const SCOPES = ['Organization', 'Academics', 'Growth', 'Technology', 'Operations'];

export async function list(userId, scope) {
  const where = scope && scope !== 'all' ? { scope } : {};
  const rows = await prisma.announcement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true } },
      _count: { select: { acks: true } },
      acks: { where: { userId }, select: { userId: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id, scope: a.scope, title: a.title, body: a.body,
    author: a.author, createdAt: a.createdAt,
    ackCount: a._count.acks, acknowledged: a.acks.length > 0,
  }));
}

export function create(authorId, { scope, title, body }) {
  if (!SCOPES.includes(scope)) throw new ApiError(400, 'Invalid scope');
  if (!title?.trim() || !body?.trim()) throw new ApiError(400, 'Title and body are required');
  return prisma.announcement.create({ data: { scope, title: title.trim(), body: body.trim(), authorId } });
}

export async function toggleAck(announcementId, userId) {
  const key = { announcementId_userId: { announcementId, userId } };
  const existing = await prisma.announcementAck.findUnique({ where: key });
  if (existing) await prisma.announcementAck.delete({ where: key });
  else await prisma.announcementAck.create({ data: { announcementId, userId } });
  const ackCount = await prisma.announcementAck.count({ where: { announcementId } });
  return { acknowledged: !existing, ackCount };
}
