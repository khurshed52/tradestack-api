import { z } from "zod";

// ======================================================
// SUPPORTED CURRENCIES
// ======================================================

const supportedCurrencies = [
  "USD",
  "EUR",
  "GBP",
  "AED",
  "INR",
] as const;


// ======================================================
// PAYMENT / PAYOUT PROVIDERS
// ======================================================

export const paymentProviders = [
  "STRIPE",
  "FATOORA",
  "SKRILL",
] as const;


// ======================================================
// CREATE DEPOSIT
// ======================================================

export const createDepositSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .regex(
      /^\d{1,20}$/,
      "Account number must contain 1 to 20 digits"
    ),

  amount: z.coerce
    .number()
    .positive(
      "Amount must be greater than 0"
    )
    .max(
      1000000,
      "Amount cannot exceed 1,000,000"
    ),

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z.enum(supportedCurrencies)
    ),

  provider: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(
      z.enum(paymentProviders)
    ),
});


// ======================================================
// DEPOSIT STATUS
// ======================================================

export const depositStatusSchema =
  z.object({
    sessionId: z
      .string()
      .trim()
      .min(
        1,
        "sessionId is required"
      )
      .max(
        255,
        "Invalid sessionId"
      ),
  });


// ======================================================
// EXCHANGE RATE
// ======================================================

export const exchangeRateSchema =
  z.object({
    fromCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z]{3}$/,
        "fromCurrency must be a valid 3-letter currency code"
      ),

    toCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z]{3}$/,
        "toCurrency must be a valid 3-letter currency code"
      ),

    amount: z.coerce
      .number()
      .positive(
        "Amount must be greater than 0"
      )
      .max(
        1000000,
        "Amount cannot exceed 1,000,000"
      ),
  });


// ======================================================
// CREATE WITHDRAWAL
//
// Customer does NOT select payout provider.
// ======================================================

export const withdrawSchema = z.object({
  accountNumber: z
    .string()
    .trim()
    .regex(
      /^[0-9]{1,20}$/,
      "accountNumber must contain 1 to 20 digits"
    ),

  amount: z.coerce
    .number()
    .positive(
      "Amount must be greater than 0"
    )
    .max(
      1000000,
      "Amount cannot exceed 1,000,000"
    ),

  payoutCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z]{3}$/,
      "payoutCurrency must be a valid 3-letter currency code"
    ),
});


// ======================================================
// WITHDRAWAL ADMIN DECISION
//
// Used for APPROVE / REJECT.
// ======================================================

export const withdrawalAdminDecisionSchema =
  z.object({
    remarks: z
      .string()
      .trim()
      .min(
        3,
        "Remarks must contain at least 3 characters"
      )
      .max(
        500,
        "Remarks cannot exceed 500 characters"
      ),
  });


// ======================================================
// PROCESS WITHDRAWAL
//
// Provider is selected by ADMIN.
// ======================================================

export const processWithdrawalSchema =
  z.object({
    provider: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(
        z.enum(paymentProviders)
      ),
  });

  // ======================================================
// TRANSFER
//
// Internal transfer between the customer's
// own trading accounts.
// ======================================================

export const transferSchema = z.object({
  sourceAccountNumber: z
    .string()
    .trim()
    .regex(
      /^[0-9]{1,20}$/,
      "sourceAccountNumber must contain 1 to 20 digits"
    ),

  destinationAccountNumber: z
    .string()
    .trim()
    .regex(
      /^[0-9]{1,20}$/,
      "destinationAccountNumber must contain 1 to 20 digits"
    ),

  amount: z.coerce
    .number()
    .positive(
      "Amount must be greater than 0"
    )
    .max(
      1000000,
      "Amount cannot exceed 1,000,000"
    ),
});

// ======================================================
// TRANSACTION HISTORY SEARCH
// ======================================================

export const transactionHistorySchema =
  z.object({
    page: z.coerce
      .number()
      .int()
      .min(
        1,
        "page must be at least 1"
      )
      .default(1),

    pageSize: z.coerce
      .number()
      .int()
      .min(
        1,
        "pageSize must be at least 1"
      )
      .max(
        100,
        "pageSize cannot exceed 100"
      )
      .default(10),

    filters: z
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

        accountNumber: z
          .string()
          .trim()
          .regex(
            /^[0-9]{1,20}$/,
            "accountNumber must contain 1 to 20 digits"
          )
          .optional(),

        reference: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .optional(),

        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z]{3}$/,
            "currency must be a valid 3-letter currency code"
          )
          .optional(),

        fromDate: z
          .string()
          .datetime()
          .optional(),

        toDate: z
          .string()
          .datetime()
          .optional(),
      })
      .default({}),
  });