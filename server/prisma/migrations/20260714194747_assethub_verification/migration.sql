-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "conductedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VerificationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCount" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subCategoryId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL DEFAULT 0,
    "actual" INTEGER,

    CONSTRAINT "VerificationCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationSession_status_idx" ON "VerificationSession"("status");

-- CreateIndex
CREATE INDEX "VerificationLine_sessionId_idx" ON "VerificationLine"("sessionId");

-- CreateIndex
CREATE INDEX "VerificationCount_sessionId_idx" ON "VerificationCount"("sessionId");

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationLine" ADD CONSTRAINT "VerificationLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationLine" ADD CONSTRAINT "VerificationLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AssetRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCount" ADD CONSTRAINT "VerificationCount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VerificationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCount" ADD CONSTRAINT "VerificationCount_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "AssetSubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

