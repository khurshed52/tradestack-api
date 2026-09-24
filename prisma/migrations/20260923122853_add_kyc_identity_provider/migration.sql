/*
  Warnings:

  - You are about to drop the column `sumsubApplicantId` on the `KycProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[providerSessionId]` on the table `KycProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "KycProfile_sumsubApplicantId_key";

-- AlterTable
ALTER TABLE "KycProfile" DROP COLUMN "sumsubApplicantId",
ADD COLUMN     "identityProvider" TEXT,
ADD COLUMN     "providerSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "KycProfile_providerSessionId_key" ON "KycProfile"("providerSessionId");
