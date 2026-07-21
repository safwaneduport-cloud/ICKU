-- Completion timestamp on project tasks, so completed tasks can be filtered by
-- month for the delay analytics.
-- AlterTable
ALTER TABLE "EventTask" ADD COLUMN     "completedAt" TIMESTAMP(3);
