-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "recurCount" INTEGER,
ADD COLUMN     "recurEnd" TEXT NOT NULL DEFAULT 'never',
ADD COLUMN     "recurUntil" TEXT;

