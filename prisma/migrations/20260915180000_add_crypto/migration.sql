CREATE TABLE "Crypto" (
    "symbol" TEXT NOT NULL,
    "buyPrice" DECIMAL(28,10) NOT NULL,
    "spread" DECIMAL(28,10) NOT NULL,
    "price" DECIMAL(28,10) NOT NULL,
    "changePercent" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(28,10) NOT NULL,
    "low" DECIMAL(28,10) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Crypto_pkey" PRIMARY KEY ("symbol")
);
CREATE TABLE "CryptoPriceHistory" (
    "id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(28,10) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CryptoPriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CryptoPriceHistory_symbol_recordedAt_idx" ON "CryptoPriceHistory"("symbol", "recordedAt");
ALTER TABLE "CryptoPriceHistory" ADD CONSTRAINT "CryptoPriceHistory_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Crypto"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
