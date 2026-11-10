import type {
  FunctionDeclaration,
} from "@google/genai";

import { z } from "zod";

import {
  listMyTradingAccounts,
} from "../../account/trading-account.service.js";

// Gemini has no account ID or user ID argument.
export const getMyTradingAccountsArgsSchema = z
  .object({})
  .strict();

export const accountTools: FunctionDeclaration[] = [
  {
    name: "get_my_trading_accounts",

    description:
      "Retrieve the authenticated customer's own " +
      "trading accounts, including platform, " +
      "currency and account status. " +
      "Use when the customer asks about their " +
      "trading accounts or account status. " +
      "Do not use for balances or transactions.",

    parametersJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

export async function executeMyTradingAccounts(
  _args: z.infer<
    typeof getMyTradingAccountsArgsSchema
  >,
  userId: string
) {
  if (!userId) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  const accounts = await listMyTradingAccounts(
    userId
  );

  return {
    accountCount: accounts.length,

    accounts: accounts.map((account) => ({
      // Only show the last four characters
      // of each account number to Gemini.
      accountNumberMasked:
        `****${account.accountNumber.slice(-4)}`,

      platform: account.platform,
      currency: account.currency,
      status: account.status,
    })),
  };
}