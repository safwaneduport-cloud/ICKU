import { prisma } from '../../config/prisma.js';
import { triggerDate, isTaskPastDue } from '../events/events.lib.js';
import { listConversations } from '../messages/messages.service.js';
import { approvalQueue } from '../assethub/assets.service.js';

const rupee = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// A flat, dropdown-friendly notification feed for the logged-in user.
// `count` is the badge number — actionable items only (things waiting on me).
export async function list(user) {
  const me = user.id;
  const now = new Date();

  const reports = await prisma.user.findMany({ where: { reportsToId: me }, select: { id: true } });
  const reportIds = reports.map((r) => r.id);

  const [tasks, events, leaves, expenses, announcements, kudos] = await Promise.all([
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
      title: `Approve event: ${e.name}`, sub: `Raised by ${e.owner?.name || '—'}`, link: '/approvals' });
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
