import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { DEFAULT_TEMP } from '../credentials/credentials.service.js';

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
  await prisma.authCredential.create({
    data: { userId: user.id, username, passwordHash: bcrypt.hashSync(DEFAULT_TEMP, 8), tempPassword: DEFAULT_TEMP, passwordChanged: false },
  });

  return { id: user.id, name: user.name, username, tempPassword: DEFAULT_TEMP };
}
