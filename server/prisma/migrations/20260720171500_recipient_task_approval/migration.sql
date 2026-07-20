-- Per-recipient approval gate on task assignments (project + ad-hoc), keyed on
-- the recipient's autoApproveTasks and approved by the recipient's manager.
-- AlterTable
ALTER TABLE "DirectTaskAssignee" ADD COLUMN     "approval" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN     "approverId" TEXT;

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN     "approval" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN     "approverId" TEXT;

-- Pending project-ownership transfer (held until the new owner's manager approves).
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ownerApproverId" TEXT,
ADD COLUMN     "pendingOwnerId" TEXT;

-- CreateIndex
CREATE INDEX "DirectTaskAssignee_approval_approverId_idx" ON "DirectTaskAssignee"("approval", "approverId");

-- CreateIndex
CREATE INDEX "TaskAssignee_approval_approverId_idx" ON "TaskAssignee"("approval", "approverId");
