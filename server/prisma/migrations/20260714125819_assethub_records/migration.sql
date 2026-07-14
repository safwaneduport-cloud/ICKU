-- CreateTable
CREATE TABLE "AssetRecord" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subCategoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "siteId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "roomId" TEXT,
    "custodianId" TEXT NOT NULL,
    "dateOfPurchase" TEXT,
    "vendorId" TEXT,
    "invoiceNumber" TEXT,
    "taxableValue" DOUBLE PRECISION,
    "gstAmount" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "invoiceUrl" TEXT,
    "warrantyMonths" INTEGER,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "insurancePolicyNo" TEXT,
    "insuranceExpiry" TEXT,
    "glCodeId" TEXT,
    "itcEligible" BOOLEAN,
    "itcBlockReason" TEXT,
    "datePutToUse" TEXT,
    "capitalisationMethod" TEXT,
    "deemedCostBasis" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvalChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chainIndex" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "ackRequestedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "bulkBatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byId" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetRecord_assetTag_key" ON "AssetRecord"("assetTag");

-- CreateIndex
CREATE INDEX "AssetRecord_status_idx" ON "AssetRecord"("status");

-- CreateIndex
CREATE INDEX "AssetRecord_siteId_buildingId_idx" ON "AssetRecord"("siteId", "buildingId");

-- CreateIndex
CREATE INDEX "AssetRecord_custodianId_idx" ON "AssetRecord"("custodianId");

-- CreateIndex
CREATE INDEX "AssetRecord_bulkBatchId_idx" ON "AssetRecord"("bulkBatchId");

-- CreateIndex
CREATE INDEX "AssetHistory_assetId_idx" ON "AssetHistory"("assetId");

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "AssetSubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AssetSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "AssetBuilding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "AssetRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "AssetVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_glCodeId_fkey" FOREIGN KEY ("glCodeId") REFERENCES "GlCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHistory" ADD CONSTRAINT "AssetHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AssetRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHistory" ADD CONSTRAINT "AssetHistory_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

