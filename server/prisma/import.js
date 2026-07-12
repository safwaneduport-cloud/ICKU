// Employee-master importer (reads the gitignored .data/employees.json produced
// from the HR sheet). Run stages independently:
//   node prisma/import.js masters      → seed MasterOption dropdown values
//   node prisma/import.js reset         → WIPE everything, then masters + 670 real staff
//   node prisma/import.js employees     → import staff into the current DB (no wipe)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { WEEKLYOFF_DEFAULTS } from '../src/modules/attendance/policies.lib.js';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '.data', 'employees.json');

function load() {
  if (!fs.existsSync(DATA)) {
    console.error(`Missing ${DATA}. Generate it from the HR sheet first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}

// master type → employee field it's derived from
const MASTER_SOURCES = {
  location: 'location', country: 'country', subDepartment: 'subDepartment',
  jobTitle: 'jobTitle', tier: 'tier', leavePlan: 'leavePlan', band: 'band',
  payGrade: 'payGrade', timeType: 'timeType', workerType: 'workerType',
  shiftPolicy: 'shiftPolicy', weeklyOffPolicy: 'weeklyOffPolicy',
  attendanceTrackingPolicy: 'attendanceTrackingPolicy',
  attendanceCaptureScheme: 'attendanceCaptureScheme', holidayList: 'holidayList',
  expensePolicy: 'expensePolicy', noticePeriod: 'noticePeriod',
  gender: 'gender', maritalStatus: 'maritalStatus', bloodGroup: 'bloodGroup',
};

async function seedMasters(rows) {
  console.log('Seeding master options…');
  let total = 0;
  for (const [type, field] of Object.entries(MASTER_SOURCES)) {
    // distinct values, ordered by frequency (most common first)
    const counts = new Map();
    for (const r of rows) {
      const v = r[field];
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    let sort = 0;
    for (const [value] of ordered) {
      // Weekly-off policies carry an off-days definition (HR-editable later).
      const meta = type === 'weeklyOffPolicy' && WEEKLYOFF_DEFAULTS[value] ? { offDays: WEEKLYOFF_DEFAULTS[value] } : undefined;
      await prisma.masterOption.upsert({
        where: { type_value: { type, value } },
        update: {},
        create: { type, value, sort: sort++, ...(meta ? { meta } : {}) },
      });
      total++;
    }
    if (ordered.length) console.log(`  ${type}: ${ordered.length}`);
  }
  console.log(`Master options seeded: ${total}`);
}

// Truncate every table (except the migrations ledger) so we can rebuild the org
// from scratch. CASCADE handles all FKs; non-interactive.
async function wipe() {
  console.log('Wiping existing data…');
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

const stage = process.argv[2] || 'masters';
const rows = load();
(async () => {
  if (stage === 'reset') await wipe();
  if (stage === 'masters' || stage === 'reset') await seedMasters(rows);
  if (stage === 'employees' || stage === 'reset') {
    const mod = await import('./import-employees.js');
    await mod.seedEmployees(prisma, rows, bcrypt);
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
