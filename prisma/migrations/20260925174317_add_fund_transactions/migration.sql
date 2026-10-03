-- CreateEnum
CREATE TYPE "FundTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "FundTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FundTransaction" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "FundTransactionType" NOT NULL,
    "status" "FundTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "convertedAmount" DECIMAL(18,2),
    "convertedCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "accountId" UUID,
    "sourceAccountId" UUID,
    "destinationAccountId" UUID,
    "reference" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundTransaction_reference_key" ON "FundTransaction"("reference");

-- CreateIndex
CREATE INDEX "FundTransaction_customerId_idx" ON "FundTransaction"("customerId");

-- CreateIndex
CREATE INDEX "FundTransaction_accountId_idx" ON "FundTransaction"("accountId");

-- CreateIndex
CREATE INDEX "FundTransaction_sourceAccountId_idx" ON "FundTransaction"("sourceAccountId");

-- CreateIndex
CREATE INDEX "FundTransaction_destinationAccountId_idx" ON "FundTransaction"("destinationAccountId");

-- CreateIndex
CREATE INDEX "FundTransaction_status_idx" ON "FundTransaction"("status");
