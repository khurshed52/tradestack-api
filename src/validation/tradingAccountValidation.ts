import { z } from "zod";

export const createTradingAccountSchema = z.object({
  platform: z.enum(["MT4", "MT5"]),
  currency: z.literal("USD"),
});

export type CreateTradingAccountInput = z.infer<
  typeof createTradingAccountSchema
>;