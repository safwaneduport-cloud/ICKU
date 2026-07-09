import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { getPayslip } from '../payroll/payroll.service.js';
import { getBalances } from '../leave/leave.service.js';

export const CLEARANCE_STEPS = ['Manager', 'IT / Assets', 'Finance', 'HR'];

// Full-&-final settlement — integrates payroll (salary) + leave (earned balance).
async function fnf(userId) {
  const now = new Date();
  const [slip, balances] = await Promise.all([
    getPayslip(userId, now.getFullYear(), now.getMonth() + 1),
    getBalances(userId, now.getFullYear()),
  ]);
  const earnedBal = balances.find((b) => b.id === 'earned')?.balance || 0;
  const basic = slip.earnings[0]?.amt || 0;
  const perDay = Math.round(slip.gross / 26);
  const encash = earnedBal * perDay;
  const gratuity = Math.round((15 / 26) * basic * 5);
  const finalSalary = Math.round(slip.net * 0.7);
  const recovery = 0;
  return { finalSalary, encash, gratuity, recovery, net: finalSalary + encash + gratuity - recovery, earnedBal, perDay };
}

const daysBetween = (fromDate, toStr) => Math.max(0, Math.round((new Date(toStr) - fromDate) / 86400000));

async function shape(e) {
  return {
    id: e.id, userId: e.userId, user: e.user,
    submitted: e.submitted, lastDay: e.lastDay, reason: e.reason,
    exitInterview: e.exitInterview, clearance: e.clearance, status: e.status,
    noticeDays: daysBetween(new Date(), e.lastDay),
    clearedPct: Math.round((e.clearance.length / CLEARANCE_STEPS.length) * 100),
    fnf: await fnf(e.userId),
  };
}

export async function getMine(userId) {
  const e = await prisma.exit.findFirst({ where: { userId, status: 'notice' }, include: { user: { select: { id: true, name: true } } } });
  return e ? shape(e) : null;
}

export async function listTeam(managerId, isAdmin) {
  const where = isAdmin
    ? { status: 'notice' }
    : { status: 'notice', user: { reportsToId: managerId } };
  const rows = await prisma.exit.findMany({ where, include: { user: { select: { id: true, name: true, designation: true } } } });
  return Promise.all(rows.map(shape));
}

export async function submit(userId, lastDay, reason) {
  const existing = await prisma.exit.findFirst({ where: { userId, status: 'notice' } });
  if (existing) throw new ApiError(409, 'You already have an active resignation');
  const submitted = new Date().toISOString().slice(0, 10);
  const e = await prisma.exit.create({
    data: { userId, submitted, lastDay, reason, clearance: [], exitInterview: false },
    include: { user: { select: { id: true, name: true } } },
  });
  return shape(e);
}

export async function withdraw(userId, id) {
  const e = await prisma.exit.findUnique({ where: { id } });
  if (!e || e.userId !== userId) throw new ApiError(404, 'Resignation not found');
  return prisma.exit.update({ where: { id }, data: { status: 'withdrawn' } });
}

async function loadForAction(id) {
  const e = await prisma.exit.findUnique({ where: { id }, include: { user: { select: { id: true, name: true } } } });
  if (!e) throw new ApiError(404, 'Resignation not found');
  return e;
}

export async function toggleClearance(id, step) {
  if (!CLEARANCE_STEPS.includes(step)) throw new ApiError(400, 'Unknown clearance step');
  const e = await loadForAction(id);
  const clearance = e.clearance.includes(step) ? e.clearance.filter((x) => x !== step) : [...e.clearance, step];
  const updated = await prisma.exit.update({ where: { id }, data: { clearance }, include: { user: { select: { id: true, name: true, designation: true } } } });
  return shape(updated);
}

export async function setInterview(id, value) {
  const updated = await prisma.exit.update({ where: { id }, data: { exitInterview: !!value }, include: { user: { select: { id: true, name: true, designation: true } } } });
  return shape(updated);
}

export const getExitRaw = (id) => prisma.exit.findUnique({ where: { id } });
