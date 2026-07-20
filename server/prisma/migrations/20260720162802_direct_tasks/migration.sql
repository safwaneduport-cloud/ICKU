-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoApproveTasks" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DirectTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignerId" TEXT NOT NULL,
    "dueDate" TEXT,
    "dueTime" TEXT,
    "approval" TEXT NOT NULL DEFAULT 'approved',
    "approverId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectTaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "rejectedReason" TEXT,

    CONSTRAINT "DirectTaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "DirectTask_assignerId_idx" ON "DirectTask"("assignerId");

-- CreateIndex
CREATE INDEX "DirectTask_approval_approverId_idx" ON "DirectTask"("approval", "approverId");

-- CreateIndex
CREATE INDEX "DirectTaskAssignee_userId_idx" ON "DirectTaskAssignee"("userId");

-- AddForeignKey
ALTER TABLE "DirectTask" ADD CONSTRAINT "DirectTask_assignerId_fkey" FOREIGN KEY ("assignerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectTaskAssignee" ADD CONSTRAINT "DirectTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DirectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectTaskAssignee" ADD CONSTRAINT "DirectTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

