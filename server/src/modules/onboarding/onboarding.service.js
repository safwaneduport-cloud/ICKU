import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export const ONB_CHECKLIST = [
  'Offer accepted', 'Documents uploaded', 'Joining forms signed', 'Welcome email sent',
  'Laptop allocated', 'ID card issued', 'Email account created', 'HR induction',
  'Department induction', 'IT checklist',
];

function shape(o) {
  return {
    id: o.id, name: o.name, designation: o.designation,
    departmentId: o.departmentId, department: o.department,
    joinDate: o.joinDate, offer: o.offer, done: o.done,
    progress: Math.round((o.done.length / ONB_CHECKLIST.length) * 100),
  };
}

export async function list() {
  const rows = await prisma.onboarding.findMany({
    orderBy: { joinDate: 'asc' },
    include: { department: { select: { id: true, name: true, color: true } } },
  });
  return rows.map(shape);
}

export function create({ name, designation, departmentId, joinDate }) {
  return prisma.onboarding.create({
    data: { name, designation: designation || 'New hire', departmentId: departmentId || null, joinDate, offer: 'Sent', done: [] },
  });
}

export async function toggleItem(id, item) {
  if (!ONB_CHECKLIST.includes(item)) throw new ApiError(400, 'Unknown checklist item');
  const o = await prisma.onboarding.findUnique({ where: { id } });
  if (!o) throw new ApiError(404, 'Onboarding not found');
  const done = o.done.includes(item) ? o.done.filter((x) => x !== item) : [...o.done, item];
  // Marking "Offer accepted" flips the offer status too.
  const offer = done.includes('Offer accepted') ? 'Accepted' : 'Sent';
  return prisma.onboarding.update({ where: { id }, data: { done, offer } });
}
