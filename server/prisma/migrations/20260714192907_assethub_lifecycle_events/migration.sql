-- CreateTable
CREATE TABLE "AssetEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "toSiteId" TEXT,
    "toBuildingId" TEXT,
    "toRoomId" TEXT,
    "toCustodianId" TEXT,
    "docUrl" TEXT,
    "approvalChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chainIndex" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AssetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetEvent_assetId_idx" ON "AssetEvent"("assetId");

-- CreateIndex
CREATE INDEX "AssetEvent_status_idx" ON "AssetEvent"("status");

-- AddForeignKey
ALTER TABLE "AssetEvent" ADD CONSTRAINT "AssetEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AssetRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetEvent" ADD CONSTRAINT "AssetEvent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

