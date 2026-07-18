/**
 * Set eduportEmail for the staff who have an Eduport mailbox, from a CSV the HR
 * sheet was exported to. Matches by employee number (= the ICKU user id).
 *
 * The CSV lives at prisma/.data/eduport-emails.csv (gitignored — real emails
 * never enter the repo) with a header row: employeeNumber,eduportEmail
 *
 *   cd ICKU/app/server
 *   DATABASE_URL='<supabase session pooler>' node prisma/set-eduport-emails.mjs --dry
 *   DATABASE_URL='<supabase session pooler>' node prisma/set-eduport-emails.mjs
 *
 * Idempotent, and safe: it only sets eduportEmail, only for existing employees,
 * and only accepts @eduport.app addresses.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const CSV = new URL('./.data/eduport-emails.csv', import.meta.url);

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',').map((c) => c.trim());
  const iNo = cols.indexOf('employeeNumber');
  const iMail = cols.indexOf('eduportEmail');
  if (iNo < 0 || iMail < 0) throw new Error('CSV must have columns: employeeNumber, eduportEmail');
  return lines.filter(Boolean).map((line) => {
    const parts = line.split(',');
    return { employeeNumber: parts[iNo]?.trim(), eduportEmail: parts[iMail]?.trim().toLowerCase() };
  });
}

async function main() {
  const rows = parseCsv(readFileSync(CSV, 'utf8'));
  console.log(`${rows.length} row(s) in the sheet\n`);

  let updated = 0, unchanged = 0;
  const problems = [];

  for (const { employeeNumber, eduportEmail } of rows) {
    if (!employeeNumber || !eduportEmail) { problems.push(`blank row: ${employeeNumber} / ${eduportEmail}`); continue; }
    if (!eduportEmail.endsWith('@eduport.app')) { problems.push(`${employeeNumber}: not an @eduport.app address (${eduportEmail}) — skipped`); continue; }

    const user = await prisma.user.findUnique({ where: { id: employeeNumber }, select: { id: true, name: true, eduportEmail: true } });
    if (!user) { problems.push(`${employeeNumber}: no such employee — skipped`); continue; }

    if (user.eduportEmail === eduportEmail) { unchanged++; continue; }
    console.log(`${DRY ? 'would set' : 'set'}  ${employeeNumber}  ${user.name.padEnd(24)}  ${user.eduportEmail || '(blank)'} → ${eduportEmail}`);
    if (!DRY) await prisma.user.update({ where: { id: employeeNumber }, data: { eduportEmail } });
    updated++;
  }

  console.log(`\n${DRY ? '[dry run] would update' : 'updated'}: ${updated} · already correct: ${unchanged}`);
  if (problems.length) { console.log(`\n⚠ ${problems.length} problem(s):`); problems.forEach((p) => console.log('  ', p)); }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
