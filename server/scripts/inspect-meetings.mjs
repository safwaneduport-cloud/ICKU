/**
 * Read-only: dump the real state of recent meetings so we can see exactly why
 * invites did or didn't reach attendees — owner, mode, whether a Teams event was
 * created (msEventId), the link, and each attendee's delivery address.
 *
 *   cd ICKU/app/server
 *   DATABASE_URL='<supabase session pooler>' node scripts/inspect-meetings.mjs
 *
 * Optionally pass title substrings to focus:
 *   ... node scripts/inspect-meetings.mjs Sample Testing_Gmail
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const filters = process.argv.slice(2);
const deliver = (u) => u?.eduportEmail || u?.googleEmail || '— NONE —';

const meetings = await prisma.meeting.findMany({
  where: filters.length
    ? { OR: filters.map((t) => ({ title: { contains: t, mode: 'insensitive' } })) }
    : {},
  orderBy: { createdAt: 'desc' },
  take: filters.length ? 50 : 12,
  include: {
    owner: { select: { name: true, eduportEmail: true, googleEmail: true } },
    attendees: { include: { user: { select: { name: true, eduportEmail: true, googleEmail: true } } } },
  },
});

if (!meetings.length) { console.log('no meetings matched'); await prisma.$disconnect(); process.exit(0); }

for (const m of meetings) {
  console.log(`\n━━ "${m.title}"  (${m.date} ${m.time}, ${m.durationMin}min)`);
  console.log(`   owner       : ${m.owner?.name} → ${deliver(m.owner)}`);
  console.log(`   mode        : ${m.mode}${m.room ? ' · room ' + m.room : ''}`);
  console.log(`   Teams event : ${m.msEventId ? 'CREATED ✅ (' + m.msEventId.slice(0, 18) + '…)' : 'none ❌'}`);
  console.log(`   meetingLink : ${m.meetingLink ? m.meetingLink.slice(0, 55) + '…' : '— none —'}`);
  console.log(`   inviteSeq   : ${m.inviteSeq}   created: ${m.createdAt.toISOString().slice(0, 16)}`);
  console.log(`   attendees (${m.attendees.length}):`);
  for (const a of m.attendees) console.log(`      - ${a.user.name} → ${deliver(a.user)}`);
}
console.log('');
await prisma.$disconnect();
