-- Pin messages, mute conversations, and conversation descriptions (all additive/nullable).
ALTER TABLE "Message" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "pinnedById" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN "mutedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "description" TEXT;
