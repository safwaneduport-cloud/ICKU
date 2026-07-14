-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultGlCodeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSubCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "defaultGstRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "defaultItcEligible" BOOLEAN NOT NULL DEFAULT true,
    "itcBlockReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetSubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetBuilding" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRoom" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssetRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "contact" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetApprovalBand" (
    "id" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxValue" DOUBLE PRECISION,
    "approvers" TEXT[],
    "label" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetApprovalBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "siteId" TEXT,
    "buildingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_code_key" ON "AssetCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetSubCategory_categoryId_code_key" ON "AssetSubCategory"("categoryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetSite_code_key" ON "AssetSite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetBuilding_siteId_code_key" ON "AssetBuilding"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRoom_buildingId_number_key" ON "AssetRoom"("buildingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVendor_code_key" ON "AssetVendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GlCode_code_key" ON "GlCode"("code");

-- CreateIndex
CREATE INDEX "AssetRoleAssignment_userId_idx" ON "AssetRoleAssignment"("userId");

-- CreateIndex
CREATE INDEX "AssetRoleAssignment_role_idx" ON "AssetRoleAssignment"("role");

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_defaultGlCodeId_fkey" FOREIGN KEY ("defaultGlCodeId") REFERENCES "GlCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubCategory" ADD CONSTRAINT "AssetSubCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetBuilding" ADD CONSTRAINT "AssetBuilding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AssetSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRoom" ADD CONSTRAINT "AssetRoom_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "AssetBuilding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRoleAssignment" ADD CONSTRAINT "AssetRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

