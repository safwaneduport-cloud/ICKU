import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';

export const DEFAULT_TEMP = 'Eduport@123';

// Every employee's login row (HR view). The temp password is shown only while
// the employee hasn't set their own — once they do, HR sees "changed" instead.
export async function list() {
  const creds = await prisma.authCredential.findMany({
    include: {
      user: {
        select: { id: true, name: true, employeeNumber: true, email: true, designation: true, department: { select: { name: true } } },
      },
    },
    orderBy: { user: { employeeNumber: 'asc' } },
  });
  return creds.map((c) => ({
    userId: c.userId,
    employeeNumber: c.user.employeeNumber,
    name: c.user.name,
    email: c.user.email,
    designation: c.user.designation,
    department: c.user.department?.name || '',
    username: c.username,
    tempPassword: c.passwordChanged ? null : c.tempPassword,
    passwordChanged: c.passwordChanged,
  }));
}

// HR resets a login → new temp password (defaults to the shared temp), visible again.
export async function resetPassword(userId, newPw) {
  const pw = ((newPw || '').trim()) || DEFAULT_TEMP;
  const passwordHash = bcrypt.hashSync(pw, 8);
  await prisma.authCredential
    .update({ where: { userId }, data: { passwordHash, tempPassword: pw, passwordChanged: false } })
    .catch(() => { throw new ApiError(404, 'No login for that employee'); });
  return { userId, tempPassword: pw };
}

export async function updateUsername(userId, username) {
  const u = (username || '').trim().toLowerCase();
  if (!u) throw new ApiError(400, 'Username is required');
  const dup = await prisma.authCredential.findUnique({ where: { username: u } });
  if (dup && dup.userId !== userId) throw new ApiError(409, 'That username is already taken');
  await prisma.authCredential
    .update({ where: { userId }, data: { username: u } })
    .catch(() => { throw new ApiError(404, 'No login for that employee'); });
  return { userId, username: u };
}

// Self-service: the logged-in user changes their own password.
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const cred = await prisma.authCredential.findUnique({ where: { userId } });
  if (!cred) throw new ApiError(404, 'No login found');
  const okCurrent = bcrypt.compareSync(currentPassword || '', cred.passwordHash);
  if (!okCurrent) throw new ApiError(400, 'Current password is incorrect');
  const np = (newPassword || '').trim();
  if (np.length < 6) throw new ApiError(400, 'New password must be at least 6 characters');
  const passwordHash = bcrypt.hashSync(np, 10);
  await prisma.authCredential.update({
    where: { userId },
    data: { passwordHash, tempPassword: null, passwordChanged: true },
  });
  return { ok: true };
}
