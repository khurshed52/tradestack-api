-- CreateEnum
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" UUID NOT NULL,
    "fundTransactionId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PayoutAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "providerReference" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutAttempt_fundTransactionId_idx" ON "PayoutAttempt"("fundTransactionId");

-- CreateIndex
CREATE INDEX "PayoutAttempt_provider_idx" ON "PayoutAttempt"("provider");

-- CreateIndex
CREATE INDEX "PayoutAttempt_status_idx" ON "PayoutAttempt"("status");

-- CreateIndex
CREATE INDEX "PayoutAttempt_createdAt_idx" ON "PayoutAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_provider_providerReference_key" ON "PayoutAttempt"("provider", "providerReference");

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_fundTransactionId_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "FundTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
