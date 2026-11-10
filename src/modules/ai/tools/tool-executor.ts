
import { z } from "zod";

import {
  executeMarketPrice,
  marketPriceArgsSchema,
  executeMarketNews,
  marketNewsArgsSchema,
} from "./market.tools.js";

import {
  executeMyTradingAccounts,
  getMyTradingAccountsArgsSchema,
} from "./account.tools.js";

import {
  accountBalancesArgsSchema,
  executeMyAccountBalances,
  fundTransactionsArgsSchema,
  executeMyFundTransactions,
} from "./funds.tools.js";

import {
  myKycStatusArgsSchema,
  executeMyKycStatus,
} from "./kyc.tools.js";

// --------------------------------
// CONFIGURATION
// --------------------------------

const DEFAULT_TOOL_TIMEOUT_MS = 12_000;

// Private tools require trusted user context.
const PRIVATE_AI_TOOLS = new Set([
  "get_my_trading_accounts",
  "get_my_account_balances",
  "get_my_kyc_status",
  "get_my_fund_transactions",
]);

// --------------------------------
// AUTHENTICATED EXECUTION CONTEXT
// --------------------------------

export type AiToolExecutionContext = {
  userId?: string;
};

// --------------------------------
// TOOL TYPES
// --------------------------------

type ToolHandler = (
  args: unknown,
  signal: AbortSignal,
  context: AiToolExecutionContext
) => Promise<unknown>;

type ToolDefinition<T extends z.ZodType> = {
  schema: T;
  execute: (
    args: z.output<T>,
    signal: AbortSignal,
    context: AiToolExecutionContext
  ) => Promise<unknown>;
};

// --------------------------------
// TOOL REGISTRATION HELPER
// --------------------------------

function defineTool<T extends z.ZodType>(
  definition: ToolDefinition<T>
): ToolHandler {
  return async (args, signal, context) => {
    // Never trust Gemini-generated arguments.
    const validated = definition.schema.parse(args);

    signal.throwIfAborted();

    return definition.execute(
      validated,
      signal,
      context
    );
  };
}

// --------------------------------
// EXECUTE WITH TIMEOUT
// --------------------------------

async function withToolTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();

  let timeoutId:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeoutError = new Error(
    "AI_TOOL_TIMEOUT"
  );

  const timeoutPromise = new Promise<never>(
    (_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    }
  );

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

// --------------------------------
// REGISTERED TOOL HANDLERS
// --------------------------------

const handlers: Record<string, ToolHandler> = {
  // --------------------------------
  // PUBLIC MARKET PRICE
  // --------------------------------

  get_market_price: defineTool({
    schema: marketPriceArgsSchema,
    execute: executeMarketPrice,
  }),

  // --------------------------------
  // PUBLIC MARKET NEWS
  // --------------------------------

  get_latest_market_news: defineTool({
    schema: marketNewsArgsSchema,
    execute: executeMarketNews,
  }),

  // --------------------------------
  // PRIVATE TRADING ACCOUNTS
  // --------------------------------

  get_my_trading_accounts: defineTool({
    schema: getMyTradingAccountsArgsSchema,

    execute: async (args, signal, context) => {
      if (!context.userId) {
        throw new Error("AI_AUTH_REQUIRED");
      }

      signal.throwIfAborted();

      const result = await executeMyTradingAccounts(
        args,
        context.userId
      );

      signal.throwIfAborted();

      return result;
    },
  }),

  // --------------------------------
  // PRIVATE ACCOUNT BALANCES
  // --------------------------------

  get_my_account_balances: defineTool({
    schema: accountBalancesArgsSchema,

    execute: async (args, signal, context) => {
      if (!context.userId) {
        throw new Error("AI_AUTH_REQUIRED");
      }

      signal.throwIfAborted();

      const result = await executeMyAccountBalances(
        args,
        context.userId
      );

      signal.throwIfAborted();

      return result;
    },
  }),

  // --------------------------------
  // PRIVATE KYC STATUS
  // --------------------------------

  get_my_kyc_status: defineTool({
    schema: myKycStatusArgsSchema,

    execute: async (args, signal, context) => {
      if (!context.userId) {
        throw new Error("AI_AUTH_REQUIRED");
      }

      signal.throwIfAborted();

      const result = await executeMyKycStatus(
        args,
        context.userId
      );

      signal.throwIfAborted();

      return result;
    },
  }),

  // --------------------------------
  // PRIVATE FUND TRANSACTIONS
  // --------------------------------

  get_my_fund_transactions: defineTool({
    schema: fundTransactionsArgsSchema,

    execute: async (args, signal, context) => {
      if (!context.userId) {
        throw new Error("AI_AUTH_REQUIRED");
      }

      signal.throwIfAborted();

      const result =
        await executeMyFundTransactions(
          args,
          context.userId
        );

      signal.throwIfAborted();

      return result;
    },
  }),
};

// --------------------------------
// EXECUTE REGISTERED TOOL
// --------------------------------

export async function executeAiTool(
  name: string,
  args: unknown,
  context: AiToolExecutionContext = {}
): Promise<unknown> {
  // Reject unknown tool names.
  if (!Object.hasOwn(handlers, name)) {
    throw new Error("AI_TOOL_NOT_ALLOWED");
  }

  const handler = handlers[name];

  if (!handler) {
    throw new Error("AI_TOOL_NOT_ALLOWED");
  }

  // Private tools require authenticated
  // backend context, never Gemini arguments.
  if (
    PRIVATE_AI_TOOLS.has(name) &&
    !context.userId
  ) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  return withToolTimeout(
    (signal) =>
      handler(args, signal, context),
    DEFAULT_TOOL_TIMEOUT_MS
  );
}
