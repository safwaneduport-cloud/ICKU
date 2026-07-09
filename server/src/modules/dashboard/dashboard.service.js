import { prisma } from '../../config/prisma.js';
import { triggerDate, isTaskPastDue } from '../events/events.lib.js';
import { getBalances } from '../leave/leave.service.js';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A personalized snapshot for the logged-in user, pulled from every module.
export async function overview(user) {
  const me = user.id;
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  // My incomplete tasks (assigned to me), overdue first.
  const tasks = await prisma.eventTask.findMany({
    where: { completed: false, assignees: { some: { userId: me } } },
    include: { event: { select: { id: true, name: true, status: true, triggerMonth: true, triggerDay: true, approval: true } } },
  });
  const myTasks = tasks
    .filter((t) => t.event.approval !== 'rejected')
    .map((t) => {
      const trig = triggerDate(t.event);
      return { taskId: t.id, name: t.name, eventId: t.event.id, eventName: t.event.name, dueOffset: t.dueOffset, pastDue: isTaskPastDue(t, trig, now) };
    })
    .sort((a, b) => (b.pastDue ? 1 : 0) - (a.pastDue ? 1 : 0));
  const myOverdueTasks = myTasks.filter((t) => t.pastDue).length;

  // What's waiting on me (approver / manager queues).
  const reports = await prisma.user.findMany({ where: { reportsToId: me }, select: { id: true } });
  const reportIds = reports.map((r) => r.id);
  const [eventsToApprove, leaveToApprove, expensesToApprove] = await Promise.all([
    prisma.event.count({ where: { approval: 'pending', approverId: me } }),
    reportIds.length ? prisma.leaveRequest.count({ where: { userId: { in: reportIds }, status: 'pending' } }) : 0,
    reportIds.length ? prisma.expense.count({ where: { userId: { in: reportIds }, status: 'manager' } }) : 0,
  ]);

  const todayRec = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: me, date: ymd(now) } } });

  // My own pending items + leave balance.
  const [pendingLeave, pendingExpenses, openTickets] = await Promise.all([
    prisma.leaveRequest.count({ where: { userId: me, status: 'pending' } }),
    prisma.expense.count({ where: { userId: me, status: { in: ['manager', 'finance', 'payment'] } } }),
    prisma.ticket.count({ where: { userId: me, status: { in: ['open', 'assigned'] } } }),
  ]);
  const balances = await getBalances(me, now.getFullYear());
  const leaveBalance = balances
    .filter((b) => ['casual', 'sick', 'earned'].includes(b.id))
    .map((b) => ({ name: b.name.replace(' Leave', ''), balance: b.balance }));

  // Company-wide upcoming context.
  const birthdaysThisMonth = await prisma.user.count({ where: { status: 'active', birthday: { startsWith: mm } } });
  const confirmed = await prisma.event.findMany({
    where: { approval: 'approved', status: 'confirmed' },
    select: { id: true, name: true, status: true, triggerMonth: true, triggerDay: true },
  });
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const eventsNext30 = confirmed
    .map((e) => ({ ...e, trig: triggerDate(e) }))
    .filter((e) => e.trig && e.trig >= now && e.trig <= in30)
    .sort((a, b) => a.trig - b.trig)
    .slice(0, 5)
    .map((e) => ({ id: e.id, name: e.name, month: e.triggerMonth, day: e.triggerDay }));

  return {
    attention: {
      myOverdueTasks, eventsToApprove, leaveToApprove, expensesToApprove,
      checkedInToday: !!todayRec?.checkIn, todayStatus: todayRec?.status || 'pending',
      hasReports: reportIds.length > 0,
    },
    myTasks: myTasks.slice(0, 8),
    myRequests: { pendingLeave, pendingExpenses, openTickets, leaveBalance },
    upcoming: { birthdaysThisMonth, eventsNext30 },
  };
}
