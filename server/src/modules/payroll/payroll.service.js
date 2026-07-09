import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { computeBreakup, monthlyGrossFor } from './payroll.lib.js';
import { getMonth } from '../attendance/attendance.service.js';

async function absentDaysFor(userId, year, month) {
  const { days } = await getMonth(userId, year, month);
  return days.filter((d) => d.status === 'absent').length;
}

async function grossFor(user) {
  if (user.salary) return user.salary.monthlyGross;
  // Fallback if a salary row is missing — derive from tier (keeps payslip resilient).
  return monthlyGrossFor(user.tier, user.id);
}

// Full payslip for one user in a month (breakup + LOP from attendance).
export async function getPayslip(userId, year, month) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { salary: true } });
  if (!user) throw new ApiError(404, 'User not found');
  const absent = await absentDaysFor(userId, year, month);
  const slip = computeBreakup(await grossFor(user), user.tier, absent);
  return {
    user: { id: user.id, name: user.name, designation: user.designation, tier: user.tier },
    year, month, ...slip,
  };
}

// Everyone's net for a month + run status + totals (payroll admin view).
export async function getRun(year, month) {
  const users = await prisma.user.findMany({
    where: { status: 'active' },
    include: { salary: true },
    orderBy: { name: 'asc' },
  });
  const rows = [];
  for (const u of users) {
    const absent = await absentDaysFor(u.id, year, month);
    const slip = computeBreakup(await grossFor(u), u.tier, absent);
    rows.push({
      id: u.id, name: u.name, designation: u.designation,
      gross: slip.gross, deductions: slip.dedTotal, net: slip.net, lopDays: absent,
    });
  }
  const totals = rows.reduce(
    (a, r) => ({ gross: a.gross + r.gross, deductions: a.deductions + r.deductions, net: a.net + r.net }),
    { gross: 0, deductions: 0, net: 0 }
  );
  const run = await prisma.payrollRun.findUnique({ where: { year_month: { year, month } } });
  return { year, month, status: run?.status || 'draft', processedAt: run?.processedAt || null, headcount: rows.length, totals, rows };
}

export async function processRun(year, month, processedById) {
  return prisma.payrollRun.upsert({
    where: { year_month: { year, month } },
    update: { status: 'processed', processedById, processedAt: new Date() },
    create: { year, month, status: 'processed', processedById, processedAt: new Date() },
  });
}

// Statutory compliance totals for a month.
export async function getCompliance(year, month) {
  const run = await getRun(year, month);
  const users = await prisma.user.findMany({ where: { status: 'active' }, include: { salary: true } });
  const acc = { pf: 0, pt: 0, esi: 0, tds: 0 };
  for (const u of users) {
    const absent = await absentDaysFor(u.id, year, month);
    const { statutory } = computeBreakup(await grossFor(u), u.tier, absent);
    acc.pf += statutory.pf; acc.pt += statutory.pt; acc.esi += statutory.esi; acc.tds += statutory.tds;
  }
  return { year, month, headcount: run.headcount, ...acc };
}
