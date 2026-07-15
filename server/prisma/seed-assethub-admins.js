// Sets the AssetHub master-data admins (Setup → Categories / Locations / Vendors /
// GL Codes / Approval Matrix / Roles).
//
// This list is AUTHORITATIVE: it grants ASSET_ADMIN to everyone below and revokes
// it from anyone else, so running it always leaves exactly this set. Day to day,
// add or remove admins in the app (AssetHub → Setup → Roles) rather than here —
// this script is just the initial/known-good state.
//
// Run:  DATABASE_URL="<url>" node prisma/seed-assethub-admins.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Employee numbers = User.id.
const ADMINS = [
  { id: 'EP002', why: 'Ajas Mohammed Jansher — Founder and CEO' },
  { id: 'EP1885', why: 'Sebastian Poulose — Finance Head' },
  { id: 'EP2222', why: 'Muhammed Sinan V — Finance Manager' },
  { id: 'EP1519', why: 'Mohammed Thanveer T T — Junior Accountant' },
  { id: 'EP1986', why: 'Muhammed Adhil V — Junior Accountant' },
  { id: 'EP736', why: 'Priya C — Finance & Accounting Associate' },
  { id: 'EP2423', why: 'Hudha K — Finance Intern' },
  { id: 'EP1487', why: 'Muhammed Nihal — Operations Assistant (Online)' },
  { id: 'EP2178', why: 'Keerthana Prakash — HR Head' },
];

async function main() {
  const wanted = new Set(ADMINS.map((a) => a.id));

  // Guard: never silently grant to an id that doesn't exist (typo'd employee no.)
  const found = await prisma.user.findMany({
    where: { id: { in: [...wanted] } },
    select: { id: true, name: true, status: true },
  });
  const byId = new Map(found.map((u) => [u.id, u]));
  const missing = ADMINS.filter((a) => !byId.has(a.id));
  if (missing.length) {
    console.error('✗ These employee numbers do not exist — fix the list and re-run:');
    missing.forEach((m) => console.error(`   ${m.id}  (${m.why})`));
    process.exit(1);
  }

  let granted = 0;
  for (const a of ADMINS) {
    const existing = await prisma.assetRoleAssignment.findFirst({
      where: { userId: a.id, role: 'ASSET_ADMIN' },
    });
    if (existing) {
      console.log(`  = already admin   ${a.id.padEnd(7)} ${a.why}`);
      continue;
    }
    await prisma.assetRoleAssignment.create({ data: { userId: a.id, role: 'ASSET_ADMIN' } });
    console.log(`  + granted         ${a.id.padEnd(7)} ${a.why}`);
    granted += 1;
  }

  // Revoke from anyone not on the list.
  const stale = await prisma.assetRoleAssignment.findMany({
    where: { role: 'ASSET_ADMIN', userId: { notIn: [...wanted] } },
    include: { user: { select: { name: true } } },
  });
  for (const s of stale) {
    await prisma.assetRoleAssignment.delete({ where: { id: s.id } });
    console.log(`  - revoked         ${s.userId.padEnd(7)} ${s.user?.name || ''}`);
  }

  const inactive = found.filter((u) => u.status !== 'active');
  if (inactive.length) {
    console.warn(`\n⚠ ${inactive.length} admin(s) are not active employees: ${inactive.map((u) => `${u.id} ${u.name}`).join(', ')}`);
  }

  console.log(`\n✓ AssetHub admins set — ${ADMINS.length} total (${granted} new, ${stale.length} revoked).`);
  console.log('  Everyone else is read-only on master data. Manage this list in AssetHub → Setup → Roles.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
