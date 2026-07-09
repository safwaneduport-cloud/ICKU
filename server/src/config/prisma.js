import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the whole app.
export const prisma = new PrismaClient();
