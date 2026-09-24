import crypto from "node:crypto";

/**
 * Generates an 8-digit customer-facing trading account number.
 *
 * Example:
 * 10482731
 *
 * The database UNIQUE constraint on accountNumber remains
 * the final protection against collisions.
 */
export const generateTradingAccountNumber = () => {
  return crypto.randomInt(
    10_000_000,
    100_000_000,
  ).toString();
};