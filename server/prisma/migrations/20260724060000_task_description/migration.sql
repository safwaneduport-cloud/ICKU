-- Optional task details, surfaced via a "View details" button when non-empty.
ALTER TABLE "EventTask" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DirectTask" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
