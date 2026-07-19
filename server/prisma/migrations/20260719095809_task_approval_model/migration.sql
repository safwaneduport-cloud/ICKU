-- AlterTable
ALTER TABLE "EventTask" ADD COLUMN     "extReqById" TEXT,
ADD COLUMN     "extReqOffset" INTEGER,
ADD COLUMN     "extReqStatus" TEXT,
ADD COLUMN     "extReqTime" TEXT;

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'accepted';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoApproveProjects" BOOLEAN NOT NULL DEFAULT true;

