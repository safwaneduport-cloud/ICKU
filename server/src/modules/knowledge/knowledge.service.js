import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export const KTYPES = ['SOP', 'Policy', 'Guide', 'FAQ', 'Manual'];

const listInclude = {
  owner: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, color: true } },
};

export async function list({ type, dept, q } = {}) {
  const where = {};
  if (type && type !== 'all') where.type = type;
  if (dept && dept !== 'all') where.departmentId = dept;
  if (q?.trim()) {
    const term = q.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { body: { contains: term, mode: 'insensitive' } },
      { tags: { has: term.toLowerCase() } },
    ];
  }
  return prisma.knowledgeDoc.findMany({ where, orderBy: { updatedAt: 'desc' }, include: listInclude });
}

export async function get(id) {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id }, include: listInclude });
  if (!doc) throw new ApiError(404, 'Document not found');
  let linkedEvent = null;
  if (doc.eventId) {
    linkedEvent = await prisma.event.findUnique({ where: { id: doc.eventId }, select: { id: true, name: true } });
  }
  return { ...doc, linkedEvent };
}

export function create(ownerId, data) {
  if (!data.title?.trim()) throw new ApiError(400, 'Title is required');
  if (!KTYPES.includes(data.type)) throw new ApiError(400, 'Invalid document type');
  return prisma.knowledgeDoc.create({
    data: {
      title: data.title.trim(), type: data.type,
      departmentId: data.departmentId || null, ownerId,
      body: data.body || '', link: data.link || null, eventId: data.eventId || null,
      tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
      attachments: data.attachments || undefined,
    },
    include: listInclude,
  });
}

export async function update(id, actor, data) {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id } });
  if (!doc) throw new ApiError(404, 'Document not found');
  const isAdmin = actor.id === 'ceo' || actor.role === 'HR Head';
  if (doc.ownerId !== actor.id && !isAdmin) throw new ApiError(403, 'Only the owner or an admin can edit this');
  return prisma.knowledgeDoc.update({
    where: { id },
    data: {
      title: data.title?.trim() ?? undefined,
      type: data.type ?? undefined,
      departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
      body: data.body ?? undefined,
      link: data.link === undefined ? undefined : data.link || null,
      tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : undefined,
    },
    include: listInclude,
  });
}
