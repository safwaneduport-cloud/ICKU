-- Manager "Clear" marker on a completion (excused vs cleared-as-black-mark).
-- AlterTable
ALTER TABLE "ChecklistCompletion" ADD COLUMN     "clearedById" TEXT;

-- 7-day rolling checklist activity log (history view + restore).
-- CreateTable
CREATE TABLE "ChecklistActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "frequency" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistActivity_userId_createdAt_idx" ON "ChecklistActivity"("userId", "createdAt");
