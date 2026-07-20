import { prisma } from '../../config/prisma.js';
import { triggerDate, isTaskPastDue } from '../events/events.lib.js';
import { listConversations, dueReminders } from '../messages/messages.service.js';
import { approvalQueue } from '../assethub/assets.service.js';
import { bellFor as helpdeskBell } from '../helpdesk/helpdesk.service.js';

const rupee = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// A flat, dropdown-friendly notification feed for the logged-in user.
// `count` is the badge number — actionable items only (things waiting on me).
export async function list(user) {
  const me = user.id;
  const now = new Date();

  const reports = await prisma.user.findMany({ where: { reportsToId: me }, select: { id: true } });
  const reportIds = reports.map((r) => r.id);

  const [tasks, events, leaves, expenses, announcements, kudos, ownerTasks, directApprovals] = await Promise.all([
    // My overdue tasks.
    prisma.eventTask.findMany({
      where: { completed: false, assignees: { some: { userId: me } } },
      include: { event: { select: { id: true, name: true, status: true, triggerMonth: true, triggerDay: true, approval: true } } },
    }),
    // Events awaiting my approval.
    prisma.event.findMany({
      where: { approval: 'pending', approverId: me },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true } } },
    }),
    // My team's pending leave.
    reportIds.length
      ? prisma.leaveRequest.findMany({
          where: { userId: { in: reportIds }, status: 'pending' },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true } }, type: { select: { name: true } } },
        })
      : [],
    // My team's expenses waiting at the manager stage.
    reportIds.length
      ? prisma.expense.findMany({
          where: { userId: { in: reportIds }, status: 'manager' },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true } } },
        })
      : [],
    // Latest announcements (informational).
    prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { author: { select: { name: true } } },
    }),
    // Recent kudos I received (informational).
    prisma.kudos.findMany({
      where: { toId: me },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { from: { select: { name: true } } },
    }),
    // Projects I own: task rejections and pending extension requests to act on.
    prisma.eventTask.findMany({
      where: {
        event: { ownerId: me },
        OR: [{ assignees: { some: { status: 'rejected' } } }, { extReqStatus: 'pending' }],
      },
      include: {
        event: { select: { id: true, name: true } },
        assignees: { where: { status: 'rejected' }, include: { user: { select: { name: true } } } },
      },
    }),
    // Ad-hoc tasks pending my approval (I'm the assigner's manager).
    prisma.directTask.findMany({
      where: { approval: 'pending', approverId: me },
      orderBy: { createdAt: 'desc' },
      include: { assigner: { select: { name: true } } },
    }),
  ]);

  const items = [];

  tasks.forEach((t) => {
    if (t.event.approval === 'rejected') return;
    if (isTaskPastDue(t, triggerDate(t.event), now)) {
      items.push({ id: `task-${t.id}`, kind: 'overdue', actionable: true, at: null,
        title: `Overdue: ${t.name}`, sub: t.event.name, link: '/events' });
    }
  });

  events.forEach((e) => {
    items.push({ id: `event-${e.id}`, kind: 'approval', actionable: true, at: e.createdAt,
      title: `Approve project: ${e.name}`, sub: `Raised by ${e.owner?.name || '—'}`, link: '/approvals' });
  });

  directApprovals.forEach((t) => {
    items.push({ id: `dtask-${t.id}`, kind: 'approval', actionable: true, at: t.createdAt,
      title: `Approve task: ${t.title}`, sub: `Assigned by ${t.assigner?.name || '—'}`, link: '/approvals' });
  });

  // Task rejections + extension requests on projects I own.
  ownerTasks.forEach((t) => {
    if (t.extReqStatus === 'pending') {
      items.push({ id: `ext-${t.id}`, kind: 'approval', actionable: true, at: null,
        title: `Extension requested: ${t.name}`, sub: t.event.name, link: '/events' });
    }
    t.assignees.forEach((a) => {
      items.push({ id: `rej-${t.id}-${a.userId}`, kind: 'approval', actionable: true, at: a.rejectedAt,
        title: `${a.user.name} rejected: ${t.name}`, sub: t.event.name, link: '/events' });
    });
  });

  leaves.forEach((l) => {
    items.push({ id: `leave-${l.id}`, kind: 'leave', actionable: true, at: l.createdAt,
      title: `Leave request: ${l.user.name}`, sub: `${l.type.name} · ${l.days} day${l.days === 1 ? '' : 's'}`, link: '/leave' });
  });

  expenses.forEach((x) => {
    items.push({ id: `expense-${x.id}`, kind: 'expense', actionable: true, at: x.createdAt,
      title: `Expense claim: ${x.user.name}`, sub: `${x.category} · ${rupee(x.amount)}`, link: '/expenses' });
  });

  announcements.forEach((a) => {
    items.push({ id: `ann-${a.id}`, kind: 'announcement', actionable: false, at: a.createdAt,
      title: a.title, sub: `${a.scope} · ${a.author.name}`, link: '/announcements' });
  });

  kudos.forEach((k) => {
    items.push({ id: `kudos-${k.id}`, kind: 'kudos', actionable: false, at: k.createdAt,
      title: `${k.from.name} gave you kudos`, sub: k.message, link: '/engagement' });
  });

  // AssetHub — entries awaiting my approval / acknowledgement.
  const assetQueue = await approvalQueue(user);
  if (assetQueue.toApprove.length) {
    items.push({
      id: 'assets-approve', kind: 'approval', actionable: true, at: assetQueue.toApprove[0].submittedAt,
      title: `${assetQueue.toApprove.length} asset${assetQueue.toApprove.length === 1 ? '' : 's'} awaiting your approval`,
      sub: assetQueue.toApprove.slice(0, 2).map((a) => a.assetTag).join(', '), link: '/assethub',
    });
  }
  if (assetQueue.toAcknowledge.length) {
    items.push({
      id: 'assets-ack', kind: 'approval', actionable: true, at: assetQueue.toAcknowledge[0].ackRequestedAt,
      title: `${assetQueue.toAcknowledge.length} asset${assetQueue.toAcknowledge.length === 1 ? '' : 's'} to acknowledge`,
      sub: 'Confirm receipt as custodian', link: '/assethub',
    });
  }
  if (assetQueue.toApproveEvents?.length) {
    items.push({
      id: 'assets-events', kind: 'approval', actionable: true, at: assetQueue.toApproveEvents[0].createdAt,
      title: `${assetQueue.toApproveEvents.length} asset lifecycle request${assetQueue.toApproveEvents.length === 1 ? '' : 's'}`,
      sub: assetQueue.toApproveEvents.slice(0, 2).map((e) => `${e.asset.assetTag} · ${e.type.replace('_', ' ')}`).join(', '), link: '/assethub',
    });
  }

  // Helpdesk — replies on my tickets, plus the agent queue.
  const hd = await helpdeskBell(user);
  if (hd.unread.length) {
    items.push({
      id: 'hd-replies', kind: 'ticket', actionable: true, at: hd.unread[0].updatedAt,
      title: `${hd.unread.length} new repl${hd.unread.length === 1 ? 'y' : 'ies'} on your tickets`,
      sub: hd.unread.slice(0, 2).map((t) => t.subject).join(', '), link: '/helpdesk',
    });
  }
  if (hd.awaitingAssignment) {
    items.push({
      id: 'hd-open', kind: 'ticket', actionable: true, at: null,
      title: `${hd.awaitingAssignment} ticket${hd.awaitingAssignment === 1 ? '' : 's'} awaiting assignment`,
      sub: 'Helpdesk queue', link: '/helpdesk',
    });
  }
  if (hd.assignedToMe) {
    items.push({
      id: 'hd-mine', kind: 'ticket', actionable: true, at: null,
      title: `${hd.assignedToMe} ticket${hd.assignedToMe === 1 ? '' : 's'} assigned to you`,
      sub: 'Helpdesk', link: '/helpdesk',
    });
  }

  // Reminders that have come due ("Remind me" on a message).
  const reminders = await dueReminders(me);
  reminders.forEach((r) => {
    items.push({
      id: `reminder-${r.id}`, kind: 'reminder', actionable: true, at: r.remindAt,
      title: 'Reminder', sub: r.text, link: '/messages',
    });
  });

  // Unread chat messages (Groups / DMs / Event chats).
  const conversations = await listConversations(me);
  conversations.filter((c) => c.unread > 0).forEach((c) => {
    const where = c.type === 'group' ? `# ${c.name}` : c.type === 'event' ? `🗓 ${c.name}` : c.name;
    items.push({
      id: `msg-${c.id}`, kind: 'message', actionable: true, at: c.lastAt,
      title: `${c.unread} new message${c.unread === 1 ? '' : 's'}`,
      sub: `${where}${c.lastMessage ? ' · ' + (c.lastMessage.body || '📎 attachment') : ''}`,
      link: '/messages',
    });
  });

  // Actionable items first, then most recent by timestamp.
  items.sort((a, b) => {
    if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
    return new Date(b.at || 0) - new Date(a.at || 0);
  });

  return { count: items.filter((i) => i.actionable).length, items };
}
