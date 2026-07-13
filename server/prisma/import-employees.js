// Employee import — turns the 670 sheet rows into real users, departments,
// salaries and login credentials, and wires the reporting hierarchy.
// Called by import.js (the `reset`/`employees` stages).
import { LEAVE_TYPES } from '../src/modules/leave/leave.lib.js';
import { monthlyGrossFor } from '../src/modules/payroll/payroll.lib.js';
import { randomPassword } from '../src/lib/password.js';

const TIER_RANK = { Leadership: 4, 'Dept Head': 3, Manager: 2, Employee: 1 };
const PALETTE = ['#134535', '#2C7A57', '#3F6075', '#9A6312', '#9C3A2A', '#5E635B', '#1B7A6B', '#6B4D8A', '#B5651D', '#3A7D44', '#7A3F5E', '#2C5F7A'];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export async function seedEmployees(prisma, rows, bcrypt) {
  // ── reference data (leave types) ──
  console.log('Seeding leave types…');
  for (const t of LEAVE_TYPES) {
    await prisma.leaveType.upsert({ where: { id: t.id }, update: t, create: t });
  }

  // ── departments (from the 28 distinct values) ──
  console.log('Creating departments…');
  const deptNames = [...new Set(rows.map((r) => r.department).filter(Boolean))];
  const deptId = new Map();
  let di = 0;
  for (const name of deptNames) {
    const id = slug(name);
    deptId.set(name, id);
    await prisma.department.upsert({
      where: { id }, update: { name }, create: { id, name, color: PALETTE[di % PALETTE.length] },
    });
    di++;
  }

  // ── users ──  (id = Employee Number, e.g. "EP002")
  console.log(`Creating ${rows.length} employees…`);
  const validId = new Set(rows.map((r) => r.employeeNumber));
  const usernameUsed = new Set();

  const mkUsername = (r) => {
    let base = (r.workEmail || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!base) base = (r.employeeNumber || 'user').toLowerCase();
    let u = base;
    if (usernameUsed.has(u)) u = `${base}.${(r.employeeNumber || '').toLowerCase()}`;
    while (usernameUsed.has(u)) u += 'x';
    usernameUsed.add(u);
    return u;
  };

  const FIELDS = [
    'firstName', 'middleName', 'lastName', 'displayName', 'jobTitle', 'secondaryJobTitle',
    'subDepartment', 'location', 'country', 'reportingManagerEmpNo', 'dottedLineManager',
    'leavePlan', 'band', 'payGrade', 'timeType', 'workerType', 'shiftPolicy', 'weeklyOffPolicy',
    'attendanceTrackingPolicy', 'attendanceCaptureScheme', 'holidayList', 'expensePolicy',
    'noticePeriod', 'attendanceNumber', 'dateOfBirth', 'gender', 'maritalStatus', 'marriageDate',
    'bloodGroup', 'physicallyHandicapped', 'nationality', 'mobilePhone', 'workPhone', 'homePhone',
    'personalEmail', 'currentAddrLine1', 'currentAddrLine2', 'currentAddrCity', 'currentAddrState',
    'currentAddrZip', 'currentAddrCountry', 'permanentAddrLine1', 'permanentAddrLine2',
    'permanentAddrCity', 'permanentAddrState', 'permanentAddrZip', 'permanentAddrCountry',
    'fatherName', 'motherName', 'spouseName', 'childrenNames',
    'pfNumber', 'uanNumber', 'employmentStatus', 'exitDate', 'exitStatus', 'terminationType',
    'terminationReason', 'resignationNote', 'costCenter', 'birthday',
  ];

  for (const r of rows) {
    const data = {
      id: r.employeeNumber,
      employeeNumber: r.employeeNumber,
      name: r.fullName || r.displayName || r.firstName || r.employeeNumber,
      email: r.workEmail || null,
      role: r.jobTitle || r.tier || 'Employee',
      tier: r.tier || 'Employee',
      designation: r.jobTitle || 'Employee',
      status: 'active',
      departmentId: r.department ? deptId.get(r.department) : null,
      joinedOn: r.dateJoined || null,
    };
    for (const f of FIELDS) if (r[f] != null) data[f] = r[f];
    await prisma.user.create({ data });
  }

  // ── reporting hierarchy (second pass; ids now all exist) ──
  console.log('Linking reporting hierarchy…');
  for (const r of rows) {
    const mgr = r.reportingManagerEmpNo;
    if (mgr && validId.has(mgr) && mgr !== r.employeeNumber) {
      await prisma.user.update({ where: { id: r.employeeNumber }, data: { reportsToId: mgr } });
    }
  }

  // ── department / function heads → app roles that unlock gated features ──
  const headOf = (deptName, roleName) => {
    const members = rows.filter((r) => r.department === deptName);
    if (!members.length) return null;
    members.sort((a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0));
    return members[0].employeeNumber;
  };
  const roleAssign = [
    ['Human Resource', 'HR Head'],
    ['Finance', 'Finance Head'],
    ['Tech Department', 'Tech Head'],
  ];
  const heads = {};
  for (const [dept, roleName] of roleAssign) {
    const id = headOf(dept, roleName);
    if (id) { await prisma.user.update({ where: { id }, data: { role: roleName } }); heads[roleName] = id; }
  }

  // ── salaries (so payroll works) ──
  console.log('Seeding salaries…');
  for (const r of rows) {
    await prisma.salary.create({ data: { userId: r.employeeNumber, monthlyGross: monthlyGrossFor(r.tier, r.employeeNumber) } });
  }

  // ── credentials (username + a UNIQUE random temp password for everyone) ──
  console.log('Creating login credentials (unique passwords)…');
  for (const r of rows) {
    const pw = randomPassword();
    await prisma.authCredential.create({
      data: { userId: r.employeeNumber, username: mkUsername(r), passwordHash: bcrypt.hashSync(pw, 8), tempPassword: pw, passwordChanged: false },
    });
  }

  // ── summary + the HR Head login to hand the user ──
  const founder = rows.find((r) => !r.reportingManagerEmpNo)?.employeeNumber;
  const hrId = heads['HR Head'];
  const hrCred = hrId ? await prisma.authCredential.findUnique({ where: { userId: hrId }, include: { user: true } }) : null;
  console.log(`\n✓ Imported ${rows.length} employees, ${deptNames.length} departments.`);
  console.log(`  Founder/CEO: ${founder}`);
  if (hrCred) console.log(`  HR HEAD LOGIN → username: ${hrCred.username}  ·  password: ${hrCred.tempPassword}  (${hrCred.user.name})`);
  console.log('  Every employee has a UNIQUE password — export the full list from HR → Credentials (CSV/PDF).');
}
