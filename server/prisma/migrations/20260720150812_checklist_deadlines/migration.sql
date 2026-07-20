-- CreateTable
CREATE TABLE "ChecklistDeadline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "time" TEXT NOT NULL DEFAULT '18:00',
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,

    CONSTRAINT "ChecklistDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistCompletion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "late" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChecklistCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistDeadline_userId_idx" ON "ChecklistDeadline"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistDeadline_userId_frequency_key" ON "ChecklistDeadline"("userId", "frequency");

-- CreateIndex
CREATE INDEX "ChecklistCompletion_userId_late_idx" ON "ChecklistCompletion"("userId", "late");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistCompletion_itemId_periodKey_key" ON "ChecklistCompletion"("itemId", "periodKey");

-- AddForeignKey
ALTER TABLE "ChecklistCompletion" ADD CONSTRAINT "ChecklistCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

