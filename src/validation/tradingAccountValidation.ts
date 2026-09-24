import { z } from "zod";

export const createTradingAccountSchema = z.object({
  platform: z.enum(["MT4", "MT5"]),

  currency: z.enum([
    "USD",
    "EUR",
    "GBP",
    "AED",
  ]),
});

export type CreateTradingAccountInput = z.infer<
  typeof createTradingAccountSchema
>;