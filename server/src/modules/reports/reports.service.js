import { prisma } from '../../config/prisma.js';
import { list as listEvents } from '../events/events.service.js';

// Company-wide analytics aggregated from every module. Read-only.
export async function overview() {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [depts, users, salaries, leaveTypes] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ select: { id: true, tier: true, departmentId: true, status: true } }),
    prisma.salary.findMany({ select: { userId: true, monthlyGross: true } }),
    prisma.leaveType.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  const salById = Object.fromEntries(salaries.map((s) => [s.userId, s.monthlyGross]));

  // Headcount + payroll by department
  const headByDept = {};
  const payByDept = {};
  const tierMix = {};
  for (const u of users) {
    headByDept[u.departmentId] = (headByDept[u.departmentId] || 0) + 1;
    payByDept[u.departmentId] = (payByDept[u.departmentId] || 0) + (salById[u.id] || 0);
    tierMix[u.tier] = (tierMix[u.tier] || 0) + 1;
  }
  const headcountByDept = depts.map((d) => ({ name: d.name, color: d.color, value: headByDept[d.id] || 0 }));
  const payrollByDept = depts.map((d) => ({ name: d.name, color: d.color, value: payByDept[d.id] || 0 }));
  const tierMixArr = ['Leadership', 'Department Head', 'Manager', 'Employee']
    .filter((t) => tierMix[t]).map((name) => ({ name, value: tierMix[name] }));
  const monthlyPayroll = salaries.reduce((a, s) => a + s.monthlyGross, 0);

  // Attendance this month (status distribution)
  const attRows = await prisma.attendanceRecord.groupBy({ by: ['status'], where: { date: { startsWith: monthPrefix } }, _count: true });
  const attBy = Object.fromEntries(attRows.map((a) => [a.status, a._count]));
  const attendance = ['present', 'late', 'half', 'absent'].map((s) => ({ name: s, value: attBy[s] || 0 }));
  const attMarked = (attBy.present || 0) + (attBy.late || 0) + (attBy.half || 0) + (attBy.absent || 0);
  const avgOnTime = attMarked ? Math.round(((attBy.present || 0) / attMarked) * 100) : 0;

  // Leave by type (approved vs pending days)
  const lvSum = await prisma.leaveRequest.groupBy({ by: ['typeId', 'status'], _sum: { days: true } });
  const leaveByType = leaveTypes.filter((t) => t.id !== 'lop').map((t) => ({
    name: t.name.replace(' Leave', ''),
    approved: lvSum.filter((x) => x.typeId === t.id && x.status === 'approved').reduce((a, x) => a + (x._sum.days || 0), 0),
    pending: lvSum.filter((x) => x.typeId === t.id && x.status === 'pending').reduce((a, x) => a + (x._sum.days || 0), 0),
  }));

  // Event lifecycle states
  const events = await listEvents({ filter: 'all' });
  const stateCount = {};
  for (const e of events) stateCount[e.state] = (stateCount[e.state] || 0) + 1;
  const eventStates = ['overdue', 'current', 'upcoming', 'undated', 'completed']
    .filter((s) => stateCount[s]).map((name) => ({ name, value: stateCount[name] }));

  // Headline stats
  const [openTickets, pendingLeave, activeOnboardings, pendingEvents, activeExits] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: ['open', 'assigned'] } } }),
    prisma.leaveRequest.count({ where: { status: 'pending' } }),
    prisma.onboarding.count(),
    prisma.event.count({ where: { approval: 'pending' } }),
    prisma.exit.count({ where: { status: 'notice' } }),
  ]);

  return {
    stats: {
      headcount: users.filter((u) => u.status === 'active').length,
      departments: depts.length,
      avgOnTime,
      monthlyPayroll,
      openTickets,
      pendingLeave,
      activeOnboardings,
      pendingEvents,
      activeExits,
    },
    headcountByDept, tierMix: tierMixArr, payrollByDept, attendance, leaveByType, eventStates,
  };
}
