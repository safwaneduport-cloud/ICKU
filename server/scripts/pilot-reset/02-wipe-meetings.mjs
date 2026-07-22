/*
 * ICKU PILOT RESET — Part 2: Meetings scheduled via ICKU.
 *
 * Every row in the Meeting table was scheduled through ICKU. Meetings created
 * natively in Teams/Outlook are NOT stored here, so they are never touched.
 *
 * For each ICKU meeting:
 *   • if it created a real Teams event (msEventId set), cancel it in Teams
 *     via Microsoft Graph — this removes it from attendees' calendars and lets
 *     Exchange send the cancellation. Best-effort: if the owner's MS connection
 *     has since expired, the Graph call quietly no-ops and we still delete the row.
 *   • delete the ICKU meeting row (cascades attendees + action items).
 *
 * Offline meetings (no Teams event) are just deleted — we deliberately DON'T
 * send .ics cancellation emails for them, to avoid spamming everyone for a
 * pilot cleanup.
 *
 * WHERE TO RUN:  Render → the API service → "Shell" tab, where DATABASE_URL and
 *                the Microsoft Graph env vars already live. Run from repo root:
 *
 *                  node server/scripts/pilot-reset/02-wipe-meetings.mjs            # dry run (default)
 *                  node server/scripts/pilot-reset/02-wipe-meetings.mjs --confirm  # actually cancel + delete
 *
 * IRREVERSIBLE. Take a database snapshot first. Cancelling a Teams event
 * notifies its attendees — expect cancellation notices on their calendars.
 */
import 'dotenv/config';
import { prisma } from '../../src/config/prisma.js';
import { deleteTeamsEvent } from '../../src/modules/integrations/microsoft.service.js';

const CONFIRM = process.argv.includes('--confirm');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const meetings = await prisma.meeting.findMany({
    select: { id: true, title: true, date: true, ownerId: true, msEventId: true },
    orderBy: { date: 'asc' },
  });
  const withTeams = meetings.filter((m) => m.msEventId);

  console.log(`Meetings in ICKU: ${meetings.length}  (with a Teams event: ${withTeams.length})`);
  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing will be changed. Re-run with --confirm to cancel + delete.');
    for (const m of meetings) {
      console.log(`  • ${m.date}  ${m.title}  ${m.msEventId ? '→ would cancel in Teams' : '(offline, no Teams event)'}`);
    }
    await prisma.$disconnect();
    return;
  }

  let cancelled = 0; let cancelFailed = 0; let deleted = 0;
  for (const m of meetings) {
    if (m.msEventId) {
      try {
        await deleteTeamsEvent(m.ownerId, m.msEventId); // no-ops if owner not connected
        cancelled += 1;
      } catch (e) {
        cancelFailed += 1;
        console.error(`  ! Teams cancel failed for "${m.title}" (${m.id}): ${e.message}`);
      }
      await sleep(150); // stay under Graph throttling limits
    }
    await prisma.meeting.delete({ where: { id: m.id } }); // cascades attendees + actions
    deleted += 1;
  }

  console.log(`\nDone. Deleted ${deleted} meetings; Teams cancellations sent: ${cancelled}${cancelFailed ? `, failed/skipped: ${cancelFailed}` : ''}.`);
  const remaining = await prisma.meeting.count();
  console.log(`Meetings remaining in ICKU: ${remaining}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
