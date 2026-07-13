import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { randomPassword } from '../../lib/password.js';
import { canAdmin } from '../../lib/access.js';

// Fields an employee may edit themselves (Part 5/9). HR-controlled fields
// (Employee Number, Department, Job Title, Tier, Reporting Manager, policies)
// are deliberately excluded.
export const SELF_EDITABLE = [
  'mobilePhone', 'workPhone', 'homePhone', 'personalEmail', 'dateOfBirth', 'gender', 'maritalStatus',
  'marriageDate', 'bloodGroup', 'physicallyHandicapped', 'nationality',
  'currentAddrLine1', 'currentAddrLine2', 'currentAddrCity', 'currentAddrState', 'currentAddrZip', 'currentAddrCountry',
  'permanentAddrLine1', 'permanentAddrLine2', 'permanentAddrCity', 'permanentAddrState', 'permanentAddrZip', 'permanentAddrCountry',
  'fatherName', 'motherName', 'spouseName', 'childrenNames', 'panNumber', 'aadhaarNumber', 'pfNumber', 'uanNumber',
];
// Extra fields only HR may change (plain columns; department/reportsTo handled separately).
const HR_EDITABLE = [
  'firstName', 'middleName', 'lastName', 'displayName', 'secondaryJobTitle', 'subDepartment',
  'location', 'country', 'dottedLineManager', 'leavePlan', 'band', 'payGrade', 'timeType', 'workerType',
  'shiftPolicy', 'weeklyOffPolicy', 'attendanceTrackingPolicy', 'attendanceCaptureScheme', 'holidayList',
  'expensePolicy', 'noticePeriod', 'employmentStatus',
];
// The set a "complete" profile should have (drives the completion %).
const COMPLETION_FIELDS = [
  ['mobilePhone', 'Mobile Phone'], ['personalEmail', 'Personal Email'], ['dateOfBirth', 'Date of Birth'],
  ['gender', 'Gender'], ['maritalStatus', 'Marital Status'], ['bloodGroup', 'Blood Group'], ['nationality', 'Nationality'],
  ['currentAddrLine1', 'Current Address'], ['currentAddrCity', 'City'], ['currentAddrState', 'State'], ['currentAddrZip', 'PIN Code'],
  ['fatherName', "Father's Name"], ['motherName', "Mother's Name"], ['panNumber', 'PAN Number'], ['aadhaarNumber', 'Aadhaar Number'],
];

export async function getProfile(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { department: { select: { id: true, name: true } }, reportsTo: { select: { id: true, name: true } } },
  });
  if (!user) throw new ApiError(404, 'Employee not found');
  const pending = COMPLETION_FIELDS.filter(([k]) => !user[k]);
  const filled = COMPLETION_FIELDS.length - pending.length;
  return {
    user,
    completion: {
      pct: Math.round((filled / COMPLETION_FIELDS.length) * 100),
      filled, total: COMPLETION_FIELDS.length,
      pending: pending.map(([, label]) => label),
    },
  };
}

// Permission-aware update. Self → only SELF_EDITABLE. HR → everything.
export async function updateProfile(viewer, id, patch) {
  const isHr = canAdmin(viewer);
  const isSelf = viewer.id === id;
  if (!isHr && !isSelf) throw new ApiError(403, 'You can only edit your own profile');

  const allowed = isHr ? [...SELF_EDITABLE, ...HR_EDITABLE] : SELF_EDITABLE;
  const data = {};
  for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k] === '' ? null : patch[k];

  if (isHr) {
    if (patch.department !== undefined) {
      const d = patch.department ? await prisma.department.findFirst({ where: { name: patch.department } }) : null;
      data.departmentId = d?.id || null;
    }
    if (patch.reportsToId !== undefined) {
      const mgr = patch.reportsToId ? await prisma.user.findUnique({ where: { id: patch.reportsToId }, select: { id: true, employeeNumber: true } }) : null;
      data.reportsToId = mgr?.id || null;
      data.reportingManagerEmpNo = mgr?.employeeNumber || null;
    }
    if (patch.tier !== undefined) data.tier = patch.tier;
    if (patch.jobTitle !== undefined) { data.jobTitle = patch.jobTitle; data.designation = patch.jobTitle; data.role = patch.jobTitle; }
    if (patch.fullName !== undefined) { data.name = patch.fullName; }
  }

  await prisma.user.update({ where: { id }, data });
  return getProfile(id);
}

// Fields HR may set during onboarding (Part 3). `department` + `reportsToId`
// map to relations; the rest are plain columns.
const EDITABLE = [
  'employeeNumber', 'firstName', 'middleName', 'lastName', 'displayName', 'fullName',
  'workEmail', 'mobilePhone', 'location', 'country', 'department', 'subDepartment',
  'jobTitle', 'secondaryJobTitle', 'tier', 'reportsToId', 'dottedLineManager', 'dateJoined',
  'leavePlan', 'band', 'payGrade', 'timeType', 'workerType', 'shiftPolicy', 'weeklyOffPolicy',
  'attendanceTrackingPolicy', 'attendanceCaptureScheme', 'holidayList', 'expensePolicy', 'noticePeriod',
];

// Mandatory before an account can be created (Part 4).
const MANDATORY = {
  employeeNumber: 'Employee Number', firstName: 'First Name', middleName: 'Middle Name',
  lastName: 'Last Name', displayName: 'Display Name', fullName: 'Full Name', workEmail: 'Work Email',
  mobilePhone: 'Mobile Phone', department: 'Department', jobTitle: 'Job Title', tier: 'Tier',
  reportsToId: 'Reporting To', shiftPolicy: 'Shift Policy', weeklyOffPolicy: 'Weekly Off Policy',
  attendanceTrackingPolicy: 'Attendance Time Tracking Policy', attendanceCaptureScheme: 'Attendance Capture Scheme',
  holidayList: 'Holiday List',
};

// Plain columns copied straight onto the User row.
const PLAIN = [
  'firstName', 'middleName', 'lastName', 'displayName', 'jobTitle', 'secondaryJobTitle', 'subDepartment',
  'location', 'country', 'dottedLineManager', 'mobilePhone', 'leavePlan', 'band', 'payGrade', 'timeType',
  'workerType', 'shiftPolicy', 'weeklyOffPolicy', 'attendanceTrackingPolicy', 'attendanceCaptureScheme',
  'holidayList', 'expensePolicy', 'noticePeriod',
];

async function makeUsername(workEmail, empNo) {
  const taken = async (x) => !!(await prisma.authCredential.findUnique({ where: { username: x } }));
  let base = (workEmail || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') || empNo.toLowerCase();
  let u = base;
  if (await taken(u)) u = `${base}.${empNo.toLowerCase()}`;
  while (await taken(u)) u += 'x';
  return u;
}

export async function onboard(input) {
  const d = {};
  for (const k of EDITABLE) if (input[k] != null) d[k] = typeof input[k] === 'string' ? input[k].trim() : input[k];
  for (const [k, label] of Object.entries(MANDATORY)) if (!d[k]) throw new ApiError(400, `${label} is required`);

  if (await prisma.user.findUnique({ where: { id: d.employeeNumber } })) {
    throw new ApiError(409, `Employee Number ${d.employeeNumber} already exists`);
  }
  if (d.workEmail && (await prisma.user.findUnique({ where: { email: d.workEmail } }))) {
    throw new ApiError(409, `Work Email ${d.workEmail} is already in use`);
  }

  const dept = await prisma.department.findFirst({ where: { name: d.department } });
  const mgr = await prisma.user.findUnique({ where: { id: d.reportsToId }, select: { id: true, employeeNumber: true } });
  if (!mgr) throw new ApiError(400, 'Selected reporting manager was not found');

  const userData = {
    id: d.employeeNumber,
    employeeNumber: d.employeeNumber,
    name: d.fullName,
    email: d.workEmail,
    role: d.jobTitle,
    tier: d.tier,
    designation: d.jobTitle,
    status: 'active',
    departmentId: dept?.id || null,
    reportsToId: mgr.id,
    reportingManagerEmpNo: mgr.employeeNumber,
    joinedOn: d.dateJoined || null,
  };
  for (const k of PLAIN) if (d[k] != null) userData[k] = d[k];

  const user = await prisma.user.create({ data: userData });
  const username = await makeUsername(d.workEmail, d.employeeNumber);
  const tempPassword = randomPassword();
  await prisma.authCredential.create({
    data: { userId: user.id, username, passwordHash: bcrypt.hashSync(tempPassword, 8), tempPassword, passwordChanged: false },
  });

  return { id: user.id, name: user.name, username, tempPassword };
}
