-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'offline';

