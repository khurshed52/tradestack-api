-- Existing orders have no recorded account; preserve them without inventing one.
ALTER TABLE "Order" ADD COLUMN "tradingAccountId" TEXT;
