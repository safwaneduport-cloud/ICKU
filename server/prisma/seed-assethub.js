// AssetHub Phase-1 seed — indicative masters from the PRD (categories, GL
// codes, sub-categories, approval bands) + sites derived from real employee
// locations + initial ASSET_ADMIN roles. Idempotent: upserts / count-guards.
// Run:  node prisma/seed-assethub.js   (uses DATABASE_URL from .env or the shell)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PRD §4.1 indicative categories + §4.6 GL codes (one per category)
const CATEGORIES = [
  { code: 'FUR', name: 'Furniture & Fixtures', gl: 'GL-1200' },
  { code: 'ELE', name: 'Electronics & Electrical', gl: 'GL-1210' },
  { code: 'ITE', name: 'IT Equipment', gl: 'GL-1220' },
  { code: 'STU', name: 'Studio Equipment', gl: 'GL-1230' },
  { code: 'VEH', name: 'Vehicles', gl: 'GL-1240' },
  { code: 'BLD', name: 'Buildings & Leasehold Improvements', gl: 'GL-1250' },
];

// A starter set of sub-categories (Finance can edit/extend in Setup)
const SUBCATS = [
  ['FUR', 'BED', 'Steel Cot'], ['FUR', 'CUP', 'Cupboard'], ['FUR', 'TBL', 'Table'],
  ['FUR', 'CHR', 'Chair'], ['FUR', 'MAT', 'Mattress'],
  ['ELE', 'AC', 'Air Conditioner'], ['ELE', 'FAN', 'Ceiling Fan'],
  ['ELE', 'WPU', 'Water Purifier'], ['ELE', 'WMC', 'Washing Machine'], ['ELE', 'GEY', 'Geyser'],
  ['ITE', 'DSK', 'Desktop'], ['ITE', 'PRJ', 'Projector'], ['ITE', 'PRN', 'Printer'], ['ITE', 'NET', 'Networking Equipment'],
  ['STU', 'CAM', 'Camera'], ['STU', 'LEN', 'Lens'], ['STU', 'LGT', 'Studio Light'],
  ['STU', 'MIC', 'Microphone'], ['STU', 'MIX', 'Audio Mixer'],
  ['VEH', 'BUS', 'Bus'], ['VEH', 'VAN', 'Van'], ['VEH', 'CAR', 'Car'], ['VEH', 'TWO', 'Two-wheeler'],
  ['BLD', 'LHI', 'Leasehold Improvement'],
];

// PRD §4.7 placeholder approval bands (thresholds editable in Setup)
const BANDS = [
  { minValue: 0, maxValue: 50000, approvers: ['BRANCH_MANAGER', 'FINANCE_EXECUTIVE'], label: 'Routine items', sort: 0 },
  { minValue: 50001, maxValue: 500000, approvers: ['BRANCH_MANAGER', 'FINANCE_MANAGER'], label: 'Standard', sort: 1 },
  { minValue: 500001, maxValue: null, approvers: ['BRANCH_MANAGER', 'FINANCE_MANAGER', 'CFO'], label: 'High value', sort: 2 },
];

const siteCode = (name) =>
  name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SITE';

async function main() {
  // GL codes + categories
  for (const c of CATEGORIES) {
    const gl = await prisma.glCode.upsert({
      where: { code: c.gl }, update: {}, create: { code: c.gl, name: c.name },
    });
    await prisma.assetCategory.upsert({
      where: { code: c.code }, update: {}, create: { code: c.code, name: c.name, defaultGlCodeId: gl.id },
    });
  }
  console.log(`Categories + GL codes: ${CATEGORIES.length}`);

  // Sub-categories (18% GST, ITC eligible by default — Finance can override)
  const catByCode = Object.fromEntries(
    (await prisma.assetCategory.findMany()).map((c) => [c.code, c.id])
  );
  for (const [cat, code, name] of SUBCATS) {
    await prisma.assetSubCategory.upsert({
      where: { categoryId_code: { categoryId: catByCode[cat], code } },
      update: {}, create: { categoryId: catByCode[cat], code, name },
    });
  }
  console.log(`Sub-categories: ${SUBCATS.length}`);

  // Approval bands (only if none exist — admin edits are authoritative)
  if ((await prisma.assetApprovalBand.count()) === 0) {
    await prisma.assetApprovalBand.createMany({ data: BANDS });
    console.log(`Approval bands: ${BANDS.length}`);
  } else console.log('Approval bands already present — skipped.');

  // Sites from real employee locations (skip Remote); buildings/rooms via Setup
  const locs = await prisma.user.findMany({
    where: { location: { not: null } }, select: { location: true }, distinct: ['location'],
  });
  let sites = 0;
  for (const { location } of locs) {
    if (!location || /^remote$/i.test(location)) continue;
    const code = siteCode(location);
    const dup = await prisma.assetSite.findFirst({ where: { OR: [{ code }, { name: location }] } });
    if (!dup) { await prisma.assetSite.create({ data: { code, name: location } }); sites++; }
  }
  console.log(`Sites created: ${sites}`);

  // Initial ASSET_ADMINs: the founder + HR Head (assign others via Setup → Roles)
  const admins = await prisma.user.findMany({
    where: { OR: [{ id: 'EP002' }, { role: 'HR Head' }] }, select: { id: true, name: true },
  });
  for (const a of admins) {
    const has = await prisma.assetRoleAssignment.findFirst({ where: { userId: a.id, role: 'ASSET_ADMIN' } });
    if (!has) {
      await prisma.assetRoleAssignment.create({ data: { userId: a.id, role: 'ASSET_ADMIN' } });
      console.log(`ASSET_ADMIN → ${a.name} (${a.id})`);
    }
  }
  // Founder also gets CFO (approval above ₹5L) — adjustable in Setup
  const cfoHas = await prisma.assetRoleAssignment.findFirst({ where: { userId: 'EP002', role: 'CFO' } });
  if (!cfoHas && admins.some((a) => a.id === 'EP002')) {
    await prisma.assetRoleAssignment.create({ data: { userId: 'EP002', role: 'CFO' } });
    console.log('CFO → EP002');
  }

  console.log('✓ AssetHub masters seeded.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
