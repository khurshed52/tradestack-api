-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "lastSummarizedMessageId" UUID,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryUpdatedAt" TIMESTAMP(3);
