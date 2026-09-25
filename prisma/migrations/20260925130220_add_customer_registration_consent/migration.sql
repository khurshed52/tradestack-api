-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3);
