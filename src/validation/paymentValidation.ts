import { z } from "zod";

export const createCheckoutSchema = z.object({
  tradingAccountId: z.string().refine(
    (value) => /^[0-9]{1,20}$/.test(value.trim()),
    "tradingAccountId must contain 1 to 20 digits"
  ),
  amount: z.number().int().min(1).max(1000000),
  currency: z.string().refine(
    (value) => ["usd", "aed", "eur", "gbp"].includes(value.trim().toLowerCase()),
    "Supported currencies: USD, AED, EUR, GBP"
  ),
  productName: z.string().refine(
    (value) => value.trim().length > 0 && value.trim().length <= 120,
    "productName must contain 1 to 120 characters"
  ).optional(),
}).passthrough();

export const orderStatusSchema = z.object({
  sessionId: z.string().regex(
    /^cs_test_[A-Za-z0-9]{1,200}$/,
    "A valid test Checkout sessionId is required"
  ),
}).passthrough();
