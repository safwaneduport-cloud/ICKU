import { prisma } from '../config/prisma.js';

// Backend translation of the prototype's directReports/managerOf logic.
// This is the heart of relationship-based authorization.

/**
 * Is `viewerId` a manager (direct OR indirect) of `targetId`?
 * Walks up the reporting chain from the target.
 */
export async function isManagerOf(viewerId, targetId) {
  if (!viewerId || !targetId || viewerId === targetId) return false;
  let node = await prisma.user.findUnique({
    where: { id: targetId }, select: { reportsToId: true },
  });
  while (node && node.reportsToId) {
    if (node.reportsToId === viewerId) return true;
    node = await prisma.user.findUnique({
      where: { id: node.reportsToId }, select: { reportsToId: true },
    });
  }
  return false;
}

/**
 * All user ids below `managerId` in the reporting tree (direct + indirect).
 * Loads the tree once and walks it in memory — cheap for this org size.
 */
export async function getSubtree(managerId) {
  const all = await prisma.user.findMany({ select: { id: true, reportsToId: true } });
  const childrenOf = new Map();
  for (const u of all) {
    const key = u.reportsToId ?? '__root__';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(u.id);
  }
  const result = [];
  const queue = [...(childrenOf.get(managerId) || [])];
  while (queue.length) {
    const id = queue.shift();
    result.push(id);
    queue.push(...(childrenOf.get(id) || []));
  }
  return result;
}
