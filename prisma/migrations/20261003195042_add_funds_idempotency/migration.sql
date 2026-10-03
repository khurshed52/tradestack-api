-- CreateEnum
CREATE TYPE "IdempotencyOperation" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "IdempotencyRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "operation" "IdempotencyOperation" NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "fundTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyRequest_userId_idx" ON "IdempotencyRequest"("userId");

-- CreateIndex
CREATE INDEX "IdempotencyRequest_operation_idx" ON "IdempotencyRequest"("operation");

-- CreateIndex
CREATE INDEX "IdempotencyRequest_status_idx" ON "IdempotencyRequest"("status");

-- CreateIndex
CREATE INDEX "IdempotencyRequest_fundTransactionId_idx" ON "IdempotencyRequest"("fundTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRequest_userId_key_key" ON "IdempotencyRequest"("userId", "key");
