-- Per-member sidebar section/group for a channel (personal channel grouping).
-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "section" TEXT;
