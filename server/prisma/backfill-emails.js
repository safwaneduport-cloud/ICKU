/**
 * Backfill eduportEmail / googleEmail from the imported master data.
 *
 * `User.email` is the account identity (unique, drives the username) and is a
 * mix of domains — 653 gmail, 14 eduport.app, a few strays — so it can't be
 * used as "the work mailbox". This sorts the addresses already on record into
 * the two delivery fields, reading from both `email` and `personalEmail`.
 *
 * Misspelled Google domains (gamil.com, gmai.com …) ARE repaired, on HR's
 * instruction (2026-07-17). These are unambiguous — the local part is kept
 * verbatim and only the domain is rewritten — and leaving them is worse than
 * fixing them: gamil.com is a registered typosquat that silently receives the
 * mail. The repair feeds the delivery field only; `email` (the unique account
 * identity) is never rewritten, since a repair could collide with a real
 * address and identity is not this script's business. Fix the source sheet too,
 * or the next import reintroduces the typo.
 *
 * Idempotent — safe to re-run. Pass --dry to preview without writing.
 *
 *   node prisma/backfill-emails.js [--dry]
 *   DATABASE_URL="<supabase session pooler>" node prisma/backfill-emails.js   # prod
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');

const EDUPORT_DOMAIN = 'eduport.app';
const GOOGLE_DOMAINS = ['gmail.com', 'googlemail.com'];
// Unambiguous misspellings of gmail.com seen in the HR sheet. Only the domain is
// rewritten; the local part is always kept verbatim. Anything genuinely
// ambiguous (e.g. hashimpp@live.com — a real Microsoft address, not a typo)
// stays untouched and gets reported instead.
const TYPO_DOMAINS = {
  'gamil.com': 'gmail.com', 'gmaio.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
};

const clean = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : null) || null;
const domainOf = (e) => (clean(e)?.includes('@') ? clean(e).split('@').pop() : null);

/** Rewrite a known-typo domain to gmail.com, preserving the local part exactly. */
const repair = (e) => {
  const c = clean(e);
  if (!c?.includes('@')) return c;
  const fixed = TYPO_DOMAINS[domainOf(c)];
  return fixed ? `${c.slice(0, c.lastIndexOf('@'))}@${fixed}` : c;
};

const pick = (candidates, match) => candidates.map(repair).find((e) => e && match(domainOf(e))) || null;

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, personalEmail: true, eduportEmail: true, googleEmail: true },
  });

  let setEduport = 0, setGoogle = 0, unchanged = 0;
  const unreachable = [], repaired = [];

  for (const u of users) {
    const sources = [u.email, u.personalEmail];
    const eduportEmail = pick(sources, (d) => d === EDUPORT_DOMAIN);
    const googleEmail = pick(sources, (d) => GOOGLE_DOMAINS.includes(d));

    for (const e of sources) {
      if (TYPO_DOMAINS[domainOf(e)]) repaired.push(`${u.id} ${u.name}: ${clean(e)} → ${repair(e)}`);
    }
    if (!eduportEmail && !googleEmail) {
      unreachable.push(`${u.id} ${u.name} | account=${clean(u.email) || '—'} personal=${clean(u.personalEmail) || '—'}`);
    }

    // Never clobber an address a person has already corrected in their profile.
    const data = {};
    if (eduportEmail && !u.eduportEmail) data.eduportEmail = eduportEmail;
    if (googleEmail && !u.googleEmail) data.googleEmail = googleEmail;
    if (!Object.keys(data).length) { unchanged++; continue; }

    if (!DRY) await prisma.user.update({ where: { id: u.id }, data });
    if (data.eduportEmail) setEduport++;
    if (data.googleEmail) setGoogle++;
  }

  const reachable = users.length - unreachable.length;
  console.log(`${DRY ? '[dry run] would set' : 'set'}: eduportEmail=${setEduport}, googleEmail=${setGoogle}, already-populated=${unchanged}`);
  console.log(`reachable: ${reachable}/${users.length}`);

  if (repaired.length) {
    console.log(`\n✎ ${repaired.length} misspelled domain(s) repaired for delivery (source sheet still needs fixing):`);
    repaired.forEach((s) => console.log('  ', s));
  }
  if (unreachable.length) {
    console.log(`\n⚠ ${unreachable.length} with no deliverable address — they will receive nothing:`);
    unreachable.forEach((s) => console.log('  ', s));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
