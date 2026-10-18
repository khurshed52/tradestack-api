/*
  Warnings:

  - A unique constraint covering the columns `[claimToken]` on the table `EmailOutbox` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_claimToken_key" ON "EmailOutbox"("claimToken");
