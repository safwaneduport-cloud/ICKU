import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';

const publicUser = (u) => ({
  id: u.id, name: u.name, role: u.role, tier: u.tier,
  designation: u.designation, departmentId: u.departmentId, reportsToId: u.reportsToId,
});

function issueTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    user: publicUser(user),
  };
}

export async function login(username, password) {
  const cred = await prisma.authCredential.findUnique({
    where: { username }, include: { user: true },
  });
  // same error whether username or password is wrong (don't leak which)
  if (!cred) throw new ApiError(401, 'Invalid username or password');
  const ok = await bcrypt.compare(password, cred.passwordHash);
  if (!ok) throw new ApiError(401, 'Invalid username or password');
  return issueTokens(cred.user);
}

// mint a fresh access token (and rotate refresh) for a still-valid session
export async function refresh(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, 'User no longer exists');
  return issueTokens(user);
}

export async function me(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: { select: { id: true, name: true, color: true } } },
  });
  if (!user) throw new ApiError(404, 'User not found');
  return { ...publicUser(user), department: user.department };
}
