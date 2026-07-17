-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "minutesFileName" TEXT,
ADD COLUMN     "minutesFileUrl" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "roomOther" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

