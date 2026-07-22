/*
 * ICKU PILOT RESET — Part 1 (node version): projects, tasks, project messages,
 * checklists, OKRs, responsibilities.
 *
 * Same effect as 01-wipe-work-and-planning.sql, but runs as a script so you can
 * do it from the Render Shell without copying the DB password anywhere — the
 * shell already has DATABASE_URL in its environment.
 *
 *   WHERE:  Render → the ICKU API service → "Shell" tab. From the repo root:
 *
 *     node server/scripts/pilot-reset/01-wipe-work-and-planning.mjs            # dry run (counts only)
 *     node server/scripts/pilot-reset/01-wipe-work-and-planning.mjs --confirm  # actually delete
 *
 *   IRREVERSIBLE. Take a Supabase snapshot first.
 *   Deploy the auto-seed-removal code BEFORE this (already done) so the default
 *   checklists/OKRs/duties don't regenerate.
 *
 * Meetings are handled by 02-wipe-meetings.mjs (they also need cancelling in Teams).
 */
import 'dotenv/config';
import { prisma } from '../../src/config/prisma.js';

const CONFIRM = process.argv.includes('--confirm');

async function counts() {
  const [projectChats, projects, projectTasks, directTasks, responsibilities, okrs, okrApprovals, checklistItems, checklistActivity, checklistDeadlines] = await Promise.all([
    prisma.conversation.count({ where: { type: 'event' } }),
    prisma.event.count(),
    prisma.eventTask.count(),
    prisma.directTask.count(),
    prisma.duty.count(),
    prisma.okr.count(),
    prisma.okrApproval.count(),
    prisma.checklistItem.count(),
    prisma.checklistActivity.count(),
    prisma.checklistDeadline.count(),
  ]);
  return { projectChats, projects, projectTasks, directTasks, responsibilities, okrs, okrApprovals, checklistItems, checklistActivity, checklistDeadlines };
}

async function main() {
  console.log('Before:', JSON.stringify(await counts(), null, 2));
  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to wipe.');
    await prisma.$disconnect();
    return;
  }
  // One transaction: if anything fails, nothing is deleted. Child rows (task
  // assignees, comments, attachments, activity, chat members/messages/reactions,
  // checklist completions) go automatically via ON DELETE CASCADE.
  await prisma.$transaction([
    prisma.conversation.deleteMany({ where: { type: 'event' } }), // project chat channels + their messages
    prisma.event.deleteMany({}),                                   // projects → tasks, comments, attachments, activity
    prisma.directTask.deleteMany({}),                             // standalone/ad-hoc tasks
    prisma.checklistItem.deleteMany({}),                          // → checklist completions
    prisma.checklistActivity.deleteMany({}),
    prisma.checklistDeadline.deleteMany({}),
    prisma.okr.deleteMany({}),
    prisma.okrApproval.deleteMany({}),
    prisma.duty.deleteMany({}),
  ]);
  console.log('\nAfter (every count should be 0):', JSON.stringify(await counts(), null, 2));
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
