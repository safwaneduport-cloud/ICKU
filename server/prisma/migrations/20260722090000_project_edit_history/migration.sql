-- Optional short project description
ALTER TABLE "Event" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

-- Project activity / edit-history log
CREATE TABLE "EventActivity" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventActivity_eventId_idx" ON "EventActivity"("eventId");
ALTER TABLE "EventActivity" ADD CONSTRAINT "EventActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
