-- CreateEnum
CREATE TYPE "TradingPlatform" AS ENUM ('MT4', 'MT5');

-- CreateEnum
CREATE TYPE "TradingAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "platform" "TradingPlatform" NOT NULL DEFAULT 'MT5',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "TradingAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccount_accountNumber_key" ON "TradingAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "TradingAccount_customerId_idx" ON "TradingAccount"("customerId");

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
