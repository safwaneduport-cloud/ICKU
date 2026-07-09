-- CreateTable
CREATE TABLE "Duty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Duty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Okr" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "percent" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Okr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OkrApproval" (
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OkrApproval_pkey" PRIMARY KEY ("userId","year","month")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Duty_userId_idx" ON "Duty"("userId");

-- CreateIndex
CREATE INDEX "Okr_userId_year_month_idx" ON "Okr"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "ChecklistItem_userId_idx" ON "ChecklistItem"("userId");

-- AddForeignKey
ALTER TABLE "Duty" ADD CONSTRAINT "Duty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Okr" ADD CONSTRAINT "Okr_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
