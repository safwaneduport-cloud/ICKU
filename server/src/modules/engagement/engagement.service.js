import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export async function overview(userId) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  const users = await prisma.user.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, birthday: true, joinedOn: true, department: { select: { color: true } } },
  });

  const birthdays = users
    .filter((u) => u.birthday && u.birthday.slice(0, 2) === mm)
    .map((u) => ({ id: u.id, name: u.name, color: u.department?.color || '#134535', day: Number(u.birthday.slice(3, 5)) }))
    .sort((a, b) => a.day - b.day);

  const anniversaries = users
    .filter((u) => u.joinedOn && u.joinedOn.slice(5, 7) === mm)
    .map((u) => ({ id: u.id, name: u.name, color: u.department?.color || '#134535', day: Number(u.joinedOn.slice(8, 10)), years: year - Number(u.joinedOn.slice(0, 4)) }))
    .filter((u) => u.years > 0)
    .sort((a, b) => a.day - b.day);

  const kudos = await prisma.kudos.findMany({
    orderBy: { createdAt: 'desc' }, take: 20,
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
  });

  const poll = await prisma.poll.findFirst({
    where: { active: true },
    include: { options: { orderBy: { sort: 'asc' }, include: { _count: { select: { votes: true } } } } },
  });
  let pollData = null;
  if (poll) {
    const myVote = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId } } });
    const options = poll.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes }));
    pollData = { id: poll.id, question: poll.question, options, totalVotes: options.reduce((a, o) => a + o.votes, 0), myVote: myVote?.optionId || null };
  }

  return { month: now.toLocaleString('en-US', { month: 'long' }), birthdays, anniversaries, kudos, poll: pollData };
}

export async function giveKudos(fromId, toId, message) {
  if (!toId || !message?.trim()) throw new ApiError(400, 'Recipient and message are required');
  if (fromId === toId) throw new ApiError(400, 'You cannot give kudos to yourself');
  return prisma.kudos.create({
    data: { fromId, toId, message: message.trim() },
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
  });
}

export async function vote(pollId, userId, optionId) {
  const opt = await prisma.pollOption.findUnique({ where: { id: optionId } });
  if (!opt || opt.pollId !== pollId) throw new ApiError(400, 'Invalid option for this poll');
  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    update: { optionId },
    create: { pollId, userId, optionId },
  });
  return overview(userId);
}
