-- CreateTable
CREATE TABLE "Onboarding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "departmentId" TEXT,
    "joinDate" TEXT NOT NULL,
    "offer" TEXT NOT NULL DEFAULT 'Sent',
    "done" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submitted" TEXT NOT NULL,
    "lastDay" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "exitInterview" BOOLEAN NOT NULL DEFAULT false,
    "clearance" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'notice',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exit_userId_idx" ON "Exit"("userId");

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exit" ADD CONSTRAINT "Exit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
