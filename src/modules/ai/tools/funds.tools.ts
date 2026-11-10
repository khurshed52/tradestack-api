
import type {
  FunctionDeclaration,
} from "@google/genai";

import { z } from "zod";

import {
  listMyTradingAccounts,
} from "../../account/trading-account.service.js";

import {
  getTransactionHistory,
} from "../../funds/funds.service.js";

// ======================================================
// ACCOUNT BALANCES ARGUMENTS
// ======================================================

// Gemini must not supply userId, customerId,
// accountId, or accountNumber.
export const accountBalancesArgsSchema = z
  .object({})
  .strict();

// ======================================================
// FUND TRANSACTIONS ARGUMENTS
// ======================================================

export const fundTransactionsArgsSchema = z
  .object({
    type: z
      .enum([
        "DEPOSIT",
        "WITHDRAWAL",
        "TRANSFER",
      ])
      .optional(),

    status: z
      .enum([
        "PENDING",
        "COMPLETED",
        "FAILED",
        "REJECTED",
      ])
      .optional(),

    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10),
  })
  .strict();

// ======================================================
// GEMINI TOOL DECLARATIONS
// ======================================================

export const fundsTools: FunctionDeclaration[] = [
  // --------------------------------
  // GET MY ACCOUNT BALANCES
  // --------------------------------

  {
    name: "get_my_account_balances",

    description:
      "Retrieve trading account balances and " +
      "available balances for the authenticated " +
      "customer. Use for questions about account " +
      "balances and available funds. Read-only. " +
      "Do not perform financial transactions.",

    parametersJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },

  // --------------------------------
  // GET MY FUND TRANSACTIONS
  // --------------------------------

  {
    name: "get_my_fund_transactions",

    description:
      "Retrieve the authenticated customer's " +
      "fund transaction history, including " +
      "deposits, withdrawals, and transfers. " +
      "Use when customers ask about recent " +
      "transactions, latest deposits, pending " +
      "withdrawals, transfer history, or " +
      "transaction statuses. " +
      "Transactions are ordered newest first. " +
      "Optional filters are type and status. " +
      "Default limit is 10; maximum is 20. " +
      "Read-only. Never initiate transactions.",

    parametersJsonSchema: {
      type: "object",

      properties: {
        type: {
          type: "string",
          enum: [
            "DEPOSIT",
            "WITHDRAWAL",
            "TRANSFER",
          ],
        },

        status: {
          type: "string",
          enum: [
            "PENDING",
            "COMPLETED",
            "FAILED",
            "REJECTED",
          ],
        },

        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
        },
      },

      additionalProperties: false,
    },
  },
];

// ======================================================
// EXECUTE MY ACCOUNT BALANCES
// ======================================================

export async function executeMyAccountBalances(
  _args: z.infer<
    typeof accountBalancesArgsSchema
  >,
  userId: string
) {
  if (!userId) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  // Reuse the existing authenticated service.
  const accounts =
    await listMyTradingAccounts(userId);

  return {
    accountCount: accounts.length,

    accounts: accounts.map((account) => ({
      accountNumberMasked:
        `****${account.accountNumber.slice(-4)}`,

      platform: account.platform,
      currency: account.currency,
      status: account.status,

      // Preserve decimal precision.
      balance: account.balance,
      availableBalance:
        account.availableBalance,
    })),
  };
}

// ======================================================
// ACCOUNT NUMBER MASKING
// ======================================================

function maskAccountNumber(
  accountNumber: string | null | undefined
): string | null {
  if (!accountNumber) {
    return null;
  }

  return `****${accountNumber.slice(-4)}`;
}

// ======================================================
// EXECUTE MY FUND TRANSACTIONS
// ======================================================

export async function executeMyFundTransactions(
  args: z.output<
    typeof fundTransactionsArgsSchema
  >,
  userId: string
) {
  if (!userId) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  // --------------------------------
  // REUSE EXISTING FUNDS SERVICE
  // --------------------------------

  // The service:
  // - Resolves Customer by authenticated userId
  // - Checks the customer is active
  // - Filters by Customer.id
  // - Sorts newest first
  // - Handles pagination

  const result =
    await getTransactionHistory({
      userId,

      page: 1,
      pageSize: args.limit,

      filters: {
        ...(args.type
          ? { type: args.type }
          : {}),

        ...(args.status
          ? { status: args.status }
          : {}),
      },
    });

  // --------------------------------
  // MINIMIZE SENSITIVE DATA
  // --------------------------------

  // Never pass the complete service result
  // to Gemini. It contains internal IDs
  // and full account numbers.

  const transactions =
    result.pageData.map((transaction) => ({
      reference:
        transaction.reference,

      type:
        transaction.type,

      status:
        transaction.status,

      // These are already strings in
      // getTransactionHistory().
      amount:
        transaction.amount,

      currency:
        transaction.currency,

      // Deposit / withdrawal account.
      accountNumberMasked:
        maskAccountNumber(
          transaction.account?.accountNumber
        ),

      // Transfer source account.
      sourceAccountMasked:
        maskAccountNumber(
          transaction.sourceAccount
            ?.accountNumber
        ),

      // Transfer destination account.
      destinationAccountMasked:
        maskAccountNumber(
          transaction.destinationAccount
            ?.accountNumber
        ),

      // Useful for explaining pending
      // withdrawal approval.
      approvalStatus:
        transaction.approvalStatus,

      createdAt:
        transaction.createdAt.toISOString(),

      completedAt:
        transaction.completedAt
          ?.toISOString() ?? null,
    }));

  // --------------------------------
  // RETURN SAFE AI RESULT
  // --------------------------------

  return {
    totalMatchingTransactions:
      result.dataCount,

    returnedCount:
      transactions.length,

    hasMore:
      result.dataCount > transactions.length,

    appliedFilters: {
      type: args.type ?? null,
      status: args.status ?? null,
    },

    transactions,
  };
}
