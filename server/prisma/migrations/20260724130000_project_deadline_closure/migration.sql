-- Project deadline (on/after the latest task due) + the auto "Project Closure" task.
ALTER TABLE "Event" ADD COLUMN "deadline" TEXT;
ALTER TABLE "EventTask" ADD COLUMN "isClosure" BOOLEAN NOT NULL DEFAULT false;

-- Backfill one Project Closure task for every existing project that lacks one, so
-- older projects also gate their completion on a closure step (owner-checked once
-- all other tasks are done). sort 9999 keeps it last; no assignees / no due date.
INSERT INTO "EventTask" ("id", "eventId", "name", "isClosure", "sort")
SELECT gen_random_uuid(), e."id", 'Project Closure', true, 9999
FROM "Event" e
WHERE NOT EXISTS (
  SELECT 1 FROM "EventTask" t WHERE t."eventId" = e."id" AND t."isClosure" = true
);
