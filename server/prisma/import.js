// Employee-master importer (reads the gitignored .data/employees.json produced
// from the HR sheet). Run stages independently:
//   node prisma/import.js masters      → seed MasterOption dropdown values
//   node prisma/import.js employees     → replace the org with the 670 real staff
//   node prisma/import.js all           → both
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
      await prisma.masterOption.upsert({
        where: { type_value: { type, value } },
        update: {},
        create: { type, value, sort: sort++ },
      });
      total++;
    }
    if (ordered.length) console.log(`  ${type}: ${ordered.length}`);
  }
  console.log(`Master options seeded: ${total}`);
}

const stage = process.argv[2] || 'all';
const rows = load();
(async () => {
  if (stage === 'masters' || stage === 'all') await seedMasters(rows);
  if (stage === 'employees' || stage === 'all') {
    const mod = await import('./import-employees.js');
    await mod.seedEmployees(prisma, rows, bcrypt);
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
