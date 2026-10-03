import {
  Prisma,
  PaymentProvider,
} from "../../generated/prisma/client.js";

import prisma from "../../db/db.config.js";

import { getExchangeRate } from "./fx.service.js";

import { randomUUID } from "node:crypto";

import { getPaymentProvider } from "./providers/index.js";
import { createIdempotencyRequestHash } from "./utils/idempotency.js";
const WITHDRAWAL_APPROVAL_THRESHOLD_USD = new Prisma.Decimal("100");
// ======================================================
// DEPOSIT TYPES
// ======================================================

type CreateDepositInput = {
  userId: string;
  accountNumber: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  idempotencyKey: string;
};


// ======================================================
// CREATE DEPOSIT
// ======================================================

export const createDeposit = async ({
  userId,
  accountNumber,
  amount,
  currency,
  provider,
  idempotencyKey,
}: CreateDepositInput) => {
  const normalizedCurrency =
    currency.trim().toUpperCase();

  // --------------------------------
  // IDEMPOTENCY HASH
  // --------------------------------

  const requestHash =
    createIdempotencyRequestHash({
      operation: "DEPOSIT",
      accountNumber,
      amount,
      currency: normalizedCurrency,
      provider,
    });

  // --------------------------------
  // FIND CUSTOMER
  // --------------------------------

  const customer =
    await prisma.customer.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

  if (!customer) {
    throw new Error(
      "CUSTOMER_NOT_FOUND"
    );
  }

  if (!customer.isActive) {
    throw new Error(
      "CUSTOMER_INACTIVE"
    );
  }

  // --------------------------------
  // CHECK EXISTING IDEMPOTENCY REQUEST
  // --------------------------------

  const existingRequest =
    await prisma.idempotencyRequest.findUnique({
      where: {
        userId_key: {
          userId,
          key: idempotencyKey,
        },
      },
    });

  if (existingRequest) {
    // Same key must belong to exactly
    // the same deposit request.

    if (
      existingRequest.requestHash !==
        requestHash ||
      existingRequest.operation !==
        "DEPOSIT"
    ) {
      throw new Error(
        "IDEMPOTENCY_KEY_CONFLICT"
      );
    }

    if (
      existingRequest.status ===
      "PROCESSING"
    ) {
      throw new Error(
        "IDEMPOTENCY_REQUEST_PROCESSING"
      );
    }

    // --------------------------------
    // REPLAY EXISTING DEPOSIT
    // --------------------------------

    if (
      existingRequest.status ===
        "COMPLETED" &&
      existingRequest.fundTransactionId
    ) {
      const existingTransaction =
        await prisma.fundTransaction.findFirst({
          where: {
            id:
              existingRequest
                .fundTransactionId,

            customerId:
              customer.id,

            type:
              "DEPOSIT",
          },

          select: {
            id: true,
            reference: true,
            status: true,

            amount: true,
            currency: true,

            convertedAmount: true,
            convertedCurrency: true,

            exchangeRate: true,
            exchangeRateSource: true,

            account: {
              select: {
                id: true,
                accountNumber: true,
                currency: true,
              },
            },

            paymentAttempts: {
              where: {
                provider,
              },

              orderBy: {
                createdAt: "desc",
              },

              take: 1,

              select: {
                id: true,
                provider: true,
                status: true,
                providerReference: true,
              },
            },
          },
        });

      if (
        !existingTransaction ||
        !existingTransaction.account
      ) {
        throw new Error(
          "IDEMPOTENCY_TRANSACTION_NOT_FOUND"
        );
      }

      const existingPaymentAttempt =
        existingTransaction
          .paymentAttempts[0];

      if (!existingPaymentAttempt) {
        throw new Error(
          "IDEMPOTENCY_PAYMENT_ATTEMPT_NOT_FOUND"
        );
      }

      /*
       * IMPORTANT:
       *
       * We cannot reconstruct a Stripe Checkout URL
       * from providerReference alone unless the PSP
       * adapter supports retrieving the session.
       *
       * Therefore the controller/client should normally
       * retain the checkout URL from the first response.
       *
       * We'll improve persistent checkout replay later
       * if needed.
       */

      return {
        transactionId:
          existingTransaction.id,

        reference:
          existingTransaction.reference,

        status:
          existingTransaction.status,

        account: {
          id:
            existingTransaction.account.id,

          accountNumber:
            existingTransaction
              .account.accountNumber,

          currency:
            existingTransaction
              .account.currency,
        },

        deposit: {
          amount:
            existingTransaction
              .amount
              .toString(),

          currency:
            existingTransaction.currency,
        },

        conversion: {
          exchangeRate:
            existingTransaction
              .exchangeRate
              ?.toString() ??
            null,

          exchangeRateSource:
            existingTransaction
              .exchangeRateSource,

          convertedAmount:
            existingTransaction
              .convertedAmount
              ?.toString() ??
            null,

          convertedCurrency:
            existingTransaction
              .convertedCurrency,
        },

        payment: {
          attemptId:
            existingPaymentAttempt.id,

          provider:
            existingPaymentAttempt.provider,

          status:
            existingPaymentAttempt.status,

          checkoutUrl: null,
        },

        idempotentReplay: true,
      };
    }

    throw new Error(
      "IDEMPOTENCY_REQUEST_INVALID_STATE"
    );
  }

  // --------------------------------
  // FIND TRADING ACCOUNT
  // --------------------------------

  const tradingAccount =
    await prisma.tradingAccount.findUnique({
      where: {
        accountNumber,
      },

      select: {
        id: true,
        accountNumber: true,
        customerId: true,
        currency: true,
        status: true,
      },
    });

  if (
    !tradingAccount ||
    tradingAccount.customerId !==
      customer.id
  ) {
    throw new Error(
      "TRADING_ACCOUNT_NOT_FOUND"
    );
  }

  if (
    tradingAccount.status !== "ACTIVE"
  ) {
    throw new Error(
      "TRADING_ACCOUNT_NOT_ACTIVE"
    );
  }

  // --------------------------------
  // DEPOSIT AMOUNT
  // --------------------------------

  const depositAmount =
    new Prisma.Decimal(
      amount.toString()
    ).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP
    );

  if (
    depositAmount.lessThanOrEqualTo(0)
  ) {
    throw new Error(
      "INVALID_DEPOSIT_AMOUNT"
    );
  }

  // --------------------------------
  // FX QUOTE
  // --------------------------------

  const accountCurrency =
    tradingAccount.currency
      .trim()
      .toUpperCase();

  const quote =
    await getExchangeRate(
      normalizedCurrency,
      accountCurrency
    );

  const convertedAmount =
    depositAmount
      .mul(quote.rate)
      .toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP
      );

  if (
    convertedAmount.lessThanOrEqualTo(0)
  ) {
    throw new Error(
      "INVALID_CONVERTED_AMOUNT"
    );
  }

  // --------------------------------
  // TRANSACTION REFERENCE
  // --------------------------------

  const reference =
    `DEP-${randomUUID()
      .replace(/-/g, "")
      .slice(0, 16)
      .toUpperCase()}`;

  // --------------------------------
  // CREATE FINANCIAL RECORDS
  // --------------------------------

  const result =
    await prisma.$transaction(
      async (tx) => {
        // --------------------------------
        // CLAIM IDEMPOTENCY KEY
        // --------------------------------

        const idempotencyRequest =
          await tx.idempotencyRequest.upsert({
            where: {
              userId_key: {
                userId,
                key: idempotencyKey,
              },
            },

            create: {
              userId,
              key: idempotencyKey,

              operation:
                "DEPOSIT",

              requestHash,

              status:
                "PROCESSING",
            },

            update: {},
          });

        // --------------------------------
        // VERIFY CLAIM
        // --------------------------------

        if (
          idempotencyRequest.requestHash !==
            requestHash ||
          idempotencyRequest.operation !==
            "DEPOSIT"
        ) {
          throw new Error(
            "IDEMPOTENCY_KEY_CONFLICT"
          );
        }

        /*
         * If this wasn't the row we just
         * logically claimed, do not create
         * another financial transaction.
         */
        if (
          idempotencyRequest.status ===
            "COMPLETED" ||
          idempotencyRequest
            .fundTransactionId
        ) {
          throw new Error(
            "IDEMPOTENCY_REQUEST_PROCESSING"
          );
        }

        // --------------------------------
        // CREATE FUND TRANSACTION
        // --------------------------------

        const fundTransaction =
          await tx.fundTransaction.create({
            data: {
              customerId:
                customer.id,

              type:
                "DEPOSIT",

              status:
                "PENDING",

              amount:
                depositAmount,

              currency:
                normalizedCurrency,

              convertedAmount,

              convertedCurrency:
                accountCurrency,

              exchangeRate:
                quote.rate,

              exchangeRateSource:
                quote.source,

              accountId:
                tradingAccount.id,

              reference,
            },
          });

        // --------------------------------
        // CREATE PAYMENT ATTEMPT
        // --------------------------------

        const paymentAttempt =
          await tx.paymentAttempt.create({
            data: {
              fundTransactionId:
                fundTransaction.id,

              provider,

              status:
                "PENDING",

              amount:
                depositAmount,

              currency:
                normalizedCurrency,
            },
          });

        /*
         * Store the transaction ID immediately.
         *
         * The PSP call happens outside this DB
         * transaction.
         */
        await tx.idempotencyRequest.update({
          where: {
            id:
              idempotencyRequest.id,
          },

          data: {
            fundTransactionId:
              fundTransaction.id,
          },
        });

        return {
          fundTransaction,
          paymentAttempt,
          idempotencyRequestId:
            idempotencyRequest.id,
        };
      },

      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      }
    );

  // --------------------------------
  // CREATE PSP CHECKOUT
  // --------------------------------

  const paymentProvider =
    getPaymentProvider(provider);

  let checkout;

  try {
    checkout =
      await paymentProvider
        .createDepositPayment({
          paymentAttemptId:
            result.paymentAttempt.id,

          fundTransactionId:
            result.fundTransaction.id,

          accountNumber:
            tradingAccount.accountNumber,

          amount:
            result.paymentAttempt
              .amount
              .toString(),

          currency:
            result.paymentAttempt
              .currency,
        });
  } catch (error) {
    // --------------------------------
    // PSP CREATION FAILED
    // --------------------------------

    await prisma.$transaction(
      async (tx) => {
        await tx.paymentAttempt.update({
          where: {
            id:
              result.paymentAttempt.id,
          },

          data: {
            status:
              "FAILED",
          },
        });

        await tx.idempotencyRequest.update({
          where: {
            id:
              result
                .idempotencyRequestId,
          },

          data: {
            status:
              "FAILED",
          },
        });
      }
    );

    throw error;
  }

  // --------------------------------
  // SAVE PSP REFERENCE +
  // COMPLETE IDEMPOTENCY REQUEST
  // --------------------------------

  const updatedPaymentAttempt =
    await prisma.$transaction(
      async (tx) => {
        const paymentAttempt =
          await tx.paymentAttempt.update({
            where: {
              id:
                result.paymentAttempt.id,
            },

            data: {
              providerReference:
                checkout
                  .providerReference,
            },
          });

        await tx.idempotencyRequest.update({
          where: {
            id:
              result
                .idempotencyRequestId,
          },

          data: {
            status:
              "COMPLETED",
          },
        });

        return paymentAttempt;
      }
    );

  // --------------------------------
  // RESPONSE
  // --------------------------------

  return {
    transactionId:
      result.fundTransaction.id,

    reference:
      result.fundTransaction.reference,

    status:
      result.fundTransaction.status,

    account: {
      id:
        tradingAccount.id,

      accountNumber:
        tradingAccount.accountNumber,

      currency:
        tradingAccount.currency,
    },

    deposit: {
      amount:
        result.fundTransaction
          .amount
          .toString(),

      currency:
        result.fundTransaction
          .currency,
    },

    conversion: {
      exchangeRate:
        result.fundTransaction
          .exchangeRate
          ?.toString() ??
        null,

      exchangeRateSource:
        result.fundTransaction
          .exchangeRateSource,

      convertedAmount:
        result.fundTransaction
          .convertedAmount
          ?.toString() ??
        null,

      convertedCurrency:
        result.fundTransaction
          .convertedCurrency,
    },

    payment: {
      attemptId:
        updatedPaymentAttempt.id,

      provider:
        updatedPaymentAttempt.provider,

      status:
        updatedPaymentAttempt.status,

      checkoutUrl:
        checkout.checkoutUrl,
    },

    idempotentReplay: false,
  };
};


// ======================================================
// GET DEPOSIT STATUS
// ======================================================

export const getDepositStatus = async (
  userId: string,
  sessionId: string
) => {
  const customer = await prisma.customer.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!customer) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  const paymentAttempt =
    await prisma.paymentAttempt.findFirst({
      where: {
        providerReference: sessionId,

        fundTransaction: {
          customerId: customer.id,
          type: "DEPOSIT",
        },
      },

      include: {
        fundTransaction: true,
      },
    });

  if (!paymentAttempt) {
    throw new Error("DEPOSIT_NOT_FOUND");
  }

  const transaction =
    paymentAttempt.fundTransaction;

  if (!transaction.accountId) {
    throw new Error(
      "DEPOSIT_ACCOUNT_NOT_FOUND"
    );
  }

  const account =
    await prisma.tradingAccount.findFirst({
      where: {
        id: transaction.accountId,
        customerId: customer.id,
      },

      select: {
        accountNumber: true,
        currency: true,
      },
    });

  if (!account) {
    throw new Error(
      "DEPOSIT_ACCOUNT_NOT_FOUND"
    );
  }

  return {
    transactionId: transaction.id,
    reference: transaction.reference,

    status: transaction.status,

    account: {
      accountNumber: account.accountNumber,
      currency: account.currency,
    },

    deposit: {
      amount:
        transaction.amount.toString(),

      currency:
        transaction.currency,
    },

    conversion: {
      exchangeRate:
        transaction.exchangeRate?.toString() ??
        null,

      exchangeRateSource:
        transaction.exchangeRateSource,

      convertedAmount:
        transaction.convertedAmount?.toString() ??
        null,

      convertedCurrency:
        transaction.convertedCurrency,
    },

    payment: {
      provider:
        paymentAttempt.provider,

      status:
        paymentAttempt.status,

      providerReference:
        paymentAttempt.providerReference,
    },

    completedAt:
      transaction.completedAt,

    createdAt:
      transaction.createdAt,
  };
};

// ======================================================
// WITHDRAWAL TYPES
// ======================================================

type CreateWithdrawalInput = {
  userId: string;
  accountNumber: string;
  amount: number;
  payoutCurrency: string;
  idempotencyKey: string;
};


// ======================================================
// CREATE WITHDRAWAL
// ======================================================

export const createWithdrawal = async ({
  userId,
  accountNumber,
  amount,
  payoutCurrency,
  idempotencyKey,
}: CreateWithdrawalInput) => {
  const normalizedPayoutCurrency =
    payoutCurrency.trim().toUpperCase();

  // --------------------------------
  // IDEMPOTENCY HASH
  // --------------------------------

  const requestHash =
    createIdempotencyRequestHash({
      operation: "WITHDRAWAL",
      accountNumber,
      amount,
      payoutCurrency:
        normalizedPayoutCurrency,
    });

  // --------------------------------
  // FIND USER + CUSTOMER
  // --------------------------------

  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        isActive: true,
        passwordChangedAt: true,

        customer: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });

  if (!user || !user.customer) {
    throw new Error(
      "CUSTOMER_NOT_FOUND"
    );
  }

  const customer =
    user.customer;

  if (
    !user.isActive ||
    !customer.isActive
  ) {
    throw new Error(
      "CUSTOMER_INACTIVE"
    );
  }

  // --------------------------------
  // CHECK EXISTING IDEMPOTENCY KEY
  // --------------------------------

  const existingRequest =
    await prisma.idempotencyRequest.findUnique({
      where: {
        userId_key: {
          userId,
          key: idempotencyKey,
        },
      },
    });

  if (existingRequest) {
    // Same key used with different body
    if (
      existingRequest.requestHash !==
      requestHash
    ) {
      throw new Error(
        "IDEMPOTENCY_KEY_CONFLICT"
      );
    }

    if (
      existingRequest.operation !==
      "WITHDRAWAL"
    ) {
      throw new Error(
        "IDEMPOTENCY_KEY_CONFLICT"
      );
    }

    if (
      existingRequest.status ===
      "PROCESSING"
    ) {
      throw new Error(
        "IDEMPOTENCY_REQUEST_PROCESSING"
      );
    }

    if (
      existingRequest.status ===
        "COMPLETED" &&
      existingRequest.fundTransactionId
    ) {
      const existingTransaction =
        await prisma.fundTransaction.findFirst({
          where: {
            id:
              existingRequest
                .fundTransactionId,

            customerId:
              customer.id,

            type:
              "WITHDRAWAL",
          },

          select: {
            id: true,
            reference: true,
            status: true,

            amount: true,
            currency: true,

            convertedAmount: true,
            convertedCurrency: true,

            exchangeRate: true,
            exchangeRateSource: true,

            withdrawalApprovalStatus:
              true,

            account: {
              select: {
                id: true,
                accountNumber: true,
                currency: true,
              },
            },
          },
        });

      if (
        !existingTransaction ||
        !existingTransaction.account
      ) {
        throw new Error(
          "IDEMPOTENCY_TRANSACTION_NOT_FOUND"
        );
      }

      // Calculate USD amount again only for
      // response consistency.
      let existingAmountUsd:
        Prisma.Decimal;

      if (
        existingTransaction.currency ===
        "USD"
      ) {
        existingAmountUsd =
          existingTransaction.amount;
      } else {
        const usdQuote =
          await getExchangeRate(
            existingTransaction.currency,
            "USD"
          );

        existingAmountUsd =
          existingTransaction.amount
            .mul(usdQuote.rate)
            .toDecimalPlaces(
              2,
              Prisma.Decimal
                .ROUND_HALF_UP
            );
      }

      const approvalRequired =
        existingTransaction
          .withdrawalApprovalStatus !==
        "NOT_REQUIRED";

      return {
        transactionId:
          existingTransaction.id,

        reference:
          existingTransaction.reference,

        status:
          existingTransaction.status,

        account: {
          id:
            existingTransaction
              .account.id,

          accountNumber:
            existingTransaction
              .account.accountNumber,

          currency:
            existingTransaction
              .account.currency,
        },

        withdrawal: {
          amount:
            existingTransaction
              .amount
              .toString(),

          currency:
            existingTransaction.currency,

          amountUsd:
            existingAmountUsd
              .toString(),
        },

        approval: {
          required:
            approvalRequired,

          status:
            existingTransaction
              .withdrawalApprovalStatus,
        },

        payout: null,

        conversion: {
          exchangeRate:
            existingTransaction
              .exchangeRate
              ?.toString() ??
            null,

          exchangeRateSource:
            existingTransaction
              .exchangeRateSource,

          convertedAmount:
            existingTransaction
              .convertedAmount
              ?.toString() ??
            null,

          convertedCurrency:
            existingTransaction
              .convertedCurrency,
        },

        idempotentReplay: true,
      };
    }

    throw new Error(
      "IDEMPOTENCY_REQUEST_INVALID_STATE"
    );
  }

  // --------------------------------
  // PASSWORD CHANGE COOLDOWN
  // --------------------------------
  //
  // Currently intentionally disabled.
  // --------------------------------

  // if (user.passwordChangedAt) {
  //   ...
  // }

  // --------------------------------
  // FIND TRADING ACCOUNT
  // --------------------------------

  const tradingAccount =
    await prisma.tradingAccount.findUnique({
      where: {
        accountNumber,
      },

      select: {
        id: true,
        accountNumber: true,
        customerId: true,
        currency: true,
        balance: true,
        reservedBalance: true,
        status: true,
      },
    });

  if (
    !tradingAccount ||
    tradingAccount.customerId !==
      customer.id
  ) {
    throw new Error(
      "TRADING_ACCOUNT_NOT_FOUND"
    );
  }

  if (
    tradingAccount.status !==
    "ACTIVE"
  ) {
    throw new Error(
      "TRADING_ACCOUNT_NOT_ACTIVE"
    );
  }

  // --------------------------------
  // WITHDRAWAL AMOUNT
  // --------------------------------

  const withdrawalAmount =
    new Prisma.Decimal(
      amount.toString()
    ).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP
    );

  if (
    withdrawalAmount.lessThanOrEqualTo(
      0
    )
  ) {
    throw new Error(
      "INVALID_WITHDRAWAL_AMOUNT"
    );
  }

  const availableBalance =
    tradingAccount.balance.minus(
      tradingAccount.reservedBalance
    );

  if (
    availableBalance.lessThan(
      withdrawalAmount
    )
  ) {
    throw new Error(
      "INSUFFICIENT_AVAILABLE_BALANCE"
    );
  }

  // --------------------------------
  // ACCOUNT CURRENCY
  // --------------------------------

  const accountCurrency =
    tradingAccount.currency
      .trim()
      .toUpperCase();

  // --------------------------------
  // ADMIN APPROVAL THRESHOLD
  // --------------------------------

  let withdrawalAmountUsd:
    Prisma.Decimal;

  if (
    accountCurrency === "USD"
  ) {
    withdrawalAmountUsd =
      withdrawalAmount;
  } else {
    const usdQuote =
      await getExchangeRate(
        accountCurrency,
        "USD"
      );

    withdrawalAmountUsd =
      withdrawalAmount
        .mul(usdQuote.rate)
        .toDecimalPlaces(
          2,
          Prisma.Decimal
            .ROUND_HALF_UP
        );
  }

  const requiresAdminApproval =
    withdrawalAmountUsd.greaterThan(
      WITHDRAWAL_APPROVAL_THRESHOLD_USD
    );

  // --------------------------------
  // PAYOUT FX
  // --------------------------------

  const quote =
    await getExchangeRate(
      accountCurrency,
      normalizedPayoutCurrency
    );

  const payoutAmount =
    withdrawalAmount
      .mul(quote.rate)
      .toDecimalPlaces(
        2,
        Prisma.Decimal
          .ROUND_HALF_UP
      );

  // --------------------------------
  // TRANSACTION REFERENCE
  // --------------------------------

  const reference =
    `WDR-${randomUUID()
      .replace(/-/g, "")
      .slice(0, 16)
      .toUpperCase()}`;

  // --------------------------------
  // ATOMIC WITHDRAWAL
  // --------------------------------

  const result =
    await prisma.$transaction(
      async (tx) => {
        // --------------------------------
        // CLAIM IDEMPOTENCY KEY
        // --------------------------------

        const idempotencyRequest =
          await tx.idempotencyRequest.upsert({
            where: {
              userId_key: {
                userId,
                key:
                  idempotencyKey,
              },
            },

            create: {
              userId,

              key:
                idempotencyKey,

              operation:
                "WITHDRAWAL",

              requestHash,

              status:
                "PROCESSING",
            },

            update: {},
          });

        // --------------------------------
        // VERIFY IDEMPOTENCY CLAIM
        // --------------------------------

        if (
          idempotencyRequest
            .requestHash !==
          requestHash ||
          idempotencyRequest
            .operation !==
          "WITHDRAWAL"
        ) {
          throw new Error(
            "IDEMPOTENCY_KEY_CONFLICT"
          );
        }

        if (
          idempotencyRequest.status ===
            "COMPLETED" &&
          idempotencyRequest
            .fundTransactionId
        ) {
          throw new Error(
            "IDEMPOTENCY_REQUEST_PROCESSING"
          );
        }

        // --------------------------------
        // RE-READ ACCOUNT
        // --------------------------------

        const account =
          await tx.tradingAccount.findUnique({
            where: {
              id:
                tradingAccount.id,
            },

            select: {
              balance: true,
              reservedBalance: true,
              status: true,
            },
          });

        if (!account) {
          throw new Error(
            "TRADING_ACCOUNT_NOT_FOUND"
          );
        }

        if (
          account.status !== "ACTIVE"
        ) {
          throw new Error(
            "TRADING_ACCOUNT_NOT_ACTIVE"
          );
        }

        // --------------------------------
        // RE-CHECK AVAILABLE BALANCE
        // --------------------------------

        const currentAvailableBalance =
          account.balance.minus(
            account.reservedBalance
          );

        if (
          currentAvailableBalance.lessThan(
            withdrawalAmount
          )
        ) {
          throw new Error(
            "INSUFFICIENT_AVAILABLE_BALANCE"
          );
        }

        // --------------------------------
        // RESERVE FUNDS
        // --------------------------------

        await tx.tradingAccount.update({
          where: {
            id:
              tradingAccount.id,
          },

          data: {
            reservedBalance: {
              increment:
                withdrawalAmount,
            },
          },
        });

        // --------------------------------
        // CREATE FUND TRANSACTION
        // --------------------------------

        const fundTransaction =
          await tx.fundTransaction.create({
            data: {
              customerId:
                customer.id,

              type:
                "WITHDRAWAL",

              status:
                "PENDING",

              withdrawalApprovalStatus:
                requiresAdminApproval
                  ? "PENDING"
                  : "NOT_REQUIRED",

              amount:
                withdrawalAmount,

              currency:
                accountCurrency,

              convertedAmount:
                payoutAmount,

              convertedCurrency:
                normalizedPayoutCurrency,

              exchangeRate:
                quote.rate,

              exchangeRateSource:
                quote.source,

              accountId:
                tradingAccount.id,

              reference,
            },
          });

        // --------------------------------
        // COMPLETE IDEMPOTENCY REQUEST
        // --------------------------------

        await tx.idempotencyRequest.update({
          where: {
            id:
              idempotencyRequest.id,
          },

          data: {
            status:
              "COMPLETED",

            fundTransactionId:
              fundTransaction.id,
          },
        });

        return fundTransaction;
      },

      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      }
    );

  // --------------------------------
  // RESPONSE
  // --------------------------------

  return {
    transactionId:
      result.id,

    reference:
      result.reference,

    status:
      result.status,

    account: {
      id:
        tradingAccount.id,

      accountNumber:
        tradingAccount.accountNumber,

      currency:
        accountCurrency,
    },

    withdrawal: {
      amount:
        result.amount.toString(),

      currency:
        result.currency,

      amountUsd:
        withdrawalAmountUsd
          .toString(),
    },

    approval: {
      required:
        requiresAdminApproval,

      status:
        result
          .withdrawalApprovalStatus,
    },

    payout: null,

    conversion: {
      exchangeRate:
        result.exchangeRate
          ?.toString() ??
        null,

      exchangeRateSource:
        result.exchangeRateSource,

      convertedAmount:
        result.convertedAmount
          ?.toString() ??
        null,

      convertedCurrency:
        result.convertedCurrency,
    },

    idempotentReplay: false,
  };
};


// ======================================================
// APPROVE WITHDRAWAL
//
// ONLY withdrawals > $100 USD equivalent require this.
//
// Approval does NOT create a PayoutAttempt.
// Admin must explicitly process the withdrawal later.
// ======================================================

export const approveWithdrawal = async (
  adminUserId: string,
  transactionId: string,
  remarks: string
) => {
  const normalizedRemarks =
    remarks?.trim();

  if (!normalizedRemarks) {
    throw new Error(
      "APPROVAL_REMARKS_REQUIRED"
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // --------------------------------
      // FIND WITHDRAWAL
      // --------------------------------

      const withdrawal =
        await tx.fundTransaction.findUnique({
          where: {
            id: transactionId,
          },

          select: {
            id: true,
            reference: true,
            type: true,
            status: true,

            amount: true,
            currency: true,

            convertedAmount: true,
            convertedCurrency: true,

            accountId: true,

            withdrawalApprovalStatus:
              true,

            approvedById: true,
            approvedAt: true,

            rejectedById: true,
            rejectedAt: true,

            approvalRemarks: true,

            payoutAttempts: {
              select: {
                id: true,
              },
            },
          },
        });

      if (!withdrawal) {
        throw new Error(
          "WITHDRAWAL_NOT_FOUND"
        );
      }

      if (
        withdrawal.type !==
        "WITHDRAWAL"
      ) {
        throw new Error(
          "INVALID_TRANSACTION_TYPE"
        );
      }

      if (
        withdrawal.status !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PENDING"
        );
      }

      // --------------------------------
      // APPROVAL STATE
      // --------------------------------

      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "APPROVED"
      ) {
        throw new Error(
          "WITHDRAWAL_ALREADY_APPROVED"
        );
      }

      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "REJECTED"
      ) {
        throw new Error(
          "WITHDRAWAL_ALREADY_REJECTED"
        );
      }

      /*
       * <= $100 withdrawals have
       * NOT_REQUIRED and must NOT go
       * through this endpoint.
       *
       * Admin can process them directly.
       */
      if (
        withdrawal
          .withdrawalApprovalStatus !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_APPROVAL_NOT_REQUIRED"
        );
      }

      // --------------------------------
      // DEFENSIVE PAYOUT CHECK
      // --------------------------------

      /*
       * A withdrawal waiting for approval
       * must not already have reached the
       * payout stage.
       */
      if (
        withdrawal.payoutAttempts
          .length > 0
      ) {
        throw new Error(
          "PAYOUT_ATTEMPT_ALREADY_EXISTS"
        );
      }

      // --------------------------------
      // APPROVE
      // --------------------------------

      const approvedAt =
        new Date();

      const approvedWithdrawal =
        await tx.fundTransaction.update({
          where: {
            id: withdrawal.id,
          },

          data: {
            withdrawalApprovalStatus:
              "APPROVED",

            approvedById:
              adminUserId,

            approvedAt,

            approvalRemarks:
              normalizedRemarks,

            rejectedById:
              null,

            rejectedAt:
              null,
          },
        });

      /*
       * IMPORTANT:
       *
       * Do NOT create PayoutAttempt here.
       *
       * Approval only authorizes the
       * withdrawal for processing.
       */
      return approvedWithdrawal;
    },

    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .Serializable,
    }
  );
};


// ======================================================
// REJECT WITHDRAWAL
//
// Admin can reject:
//
// 1. > $100 withdrawal waiting approval
// 2. <= $100 withdrawal before processing
//
// Rejection releases reserved funds.
// ======================================================

export const rejectWithdrawal = async (
  adminUserId: string,
  transactionId: string,
  remarks: string
) => {
  const normalizedRemarks =
    remarks?.trim();

  if (!normalizedRemarks) {
    throw new Error(
      "REJECTION_REMARKS_REQUIRED"
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // --------------------------------
      // FIND WITHDRAWAL
      // --------------------------------

      const withdrawal =
        await tx.fundTransaction.findUnique({
          where: {
            id: transactionId,
          },

          select: {
            id: true,
            reference: true,

            type: true,
            status: true,

            amount: true,
            currency: true,

            accountId: true,

            withdrawalApprovalStatus:
              true,

            approvedById: true,
            approvedAt: true,

            rejectedById: true,
            rejectedAt: true,

            approvalRemarks: true,

            payoutAttempts: {
              select: {
                id: true,
              },
            },
          },
        });

      if (!withdrawal) {
        throw new Error(
          "WITHDRAWAL_NOT_FOUND"
        );
      }

      if (
        withdrawal.type !==
        "WITHDRAWAL"
      ) {
        throw new Error(
          "INVALID_TRANSACTION_TYPE"
        );
      }

      if (
        withdrawal.status !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PENDING"
        );
      }

      // --------------------------------
      // REJECTION STATE
      // --------------------------------

      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "REJECTED"
      ) {
        throw new Error(
          "WITHDRAWAL_ALREADY_REJECTED"
        );
      }

      /*
       * Once a > $100 withdrawal has
       * already been approved, use the
       * processing/cancellation flow
       * instead of the approval rejection
       * endpoint.
       */
      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "APPROVED"
      ) {
        throw new Error(
          "WITHDRAWAL_ALREADY_APPROVED"
        );
      }

      /*
       * We allow rejection for:
       *
       * PENDING      -> > $100
       * NOT_REQUIRED -> <= $100
       */
      if (
        withdrawal
          .withdrawalApprovalStatus !==
          "PENDING" &&
        withdrawal
          .withdrawalApprovalStatus !==
          "NOT_REQUIRED"
      ) {
        throw new Error(
          "INVALID_WITHDRAWAL_APPROVAL_STATUS"
        );
      }

      // --------------------------------
      // PAYOUT MUST NOT EXIST
      // --------------------------------

      if (
        withdrawal.payoutAttempts
          .length > 0
      ) {
        throw new Error(
          "WITHDRAWAL_ALREADY_PROCESSING"
        );
      }

      if (!withdrawal.accountId) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      // --------------------------------
      // FIND ACCOUNT
      // --------------------------------

      const account =
        await tx.tradingAccount.findUnique({
          where: {
            id: withdrawal.accountId,
          },

          select: {
            id: true,
            reservedBalance: true,
          },
        });

      if (!account) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      if (
        account.reservedBalance.lessThan(
          withdrawal.amount
        )
      ) {
        throw new Error(
          "INVALID_RESERVED_BALANCE"
        );
      }

      // --------------------------------
      // RELEASE RESERVED BALANCE
      // --------------------------------

      /*
       * Withdrawal never reached payout.
       *
       * Actual balance remains unchanged.
       * Only reserved balance is released.
       */

      await tx.tradingAccount.update({
        where: {
          id: account.id,
        },

        data: {
          reservedBalance: {
            decrement:
              withdrawal.amount,
          },
        },
      });

      // --------------------------------
      // REJECT TRANSACTION
      // --------------------------------

      const rejectedAt =
        new Date();

      const rejectedWithdrawal =
        await tx.fundTransaction.update({
          where: {
            id: withdrawal.id,
          },

          data: {
            status:
              "REJECTED",

            withdrawalApprovalStatus:
              "REJECTED",

            rejectedById:
              adminUserId,

            rejectedAt,

            approvalRemarks:
              normalizedRemarks,

            approvedById:
              null,

            approvedAt:
              null,
          },
        });

      return rejectedWithdrawal;
    },

    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .Serializable,
    }
  );
};


// ======================================================
// COMPLETE WITHDRAWAL
//
// Called only after payout provider confirms success.
// ======================================================

export const completeWithdrawal = async (
  transactionId: string
) => {
  return prisma.$transaction(
    async (tx) => {
      // --------------------------------
      // FIND WITHDRAWAL
      // --------------------------------

      const withdrawal =
        await tx.fundTransaction.findUnique({
          where: {
            id: transactionId,
          },

          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            accountId: true,
            completedAt: true,
          },
        });

      if (!withdrawal) {
        throw new Error(
          "WITHDRAWAL_NOT_FOUND"
        );
      }

      if (
        withdrawal.type !==
        "WITHDRAWAL"
      ) {
        throw new Error(
          "INVALID_TRANSACTION_TYPE"
        );
      }

      // --------------------------------
      // IDEMPOTENCY
      // --------------------------------

      if (
        withdrawal.status ===
        "COMPLETED"
      ) {
        return withdrawal;
      }

      if (
        withdrawal.status !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PENDING"
        );
      }

      if (!withdrawal.accountId) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      // --------------------------------
      // FIND PAYOUT ATTEMPT
      // --------------------------------

      const payoutAttempt =
        await tx.payoutAttempt.findFirst({
          where: {
            fundTransactionId:
              withdrawal.id,

            status: {
              in: [
                "PENDING",
                "PROCESSING",
              ],
            },
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      if (!payoutAttempt) {
        throw new Error(
          "PAYOUT_ATTEMPT_NOT_FOUND"
        );
      }

      // --------------------------------
      // FIND ACCOUNT
      // --------------------------------

      const account =
        await tx.tradingAccount.findUnique({
          where: {
            id: withdrawal.accountId,
          },

          select: {
            id: true,
            balance: true,
            reservedBalance: true,
          },
        });

      if (!account) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      // --------------------------------
      // BALANCE CHECKS
      // --------------------------------

      if (
        account.reservedBalance.lessThan(
          withdrawal.amount
        )
      ) {
        throw new Error(
          "INVALID_RESERVED_BALANCE"
        );
      }

      if (
        account.balance.lessThan(
          withdrawal.amount
        )
      ) {
        throw new Error(
          "INSUFFICIENT_ACCOUNT_BALANCE"
        );
      }

      const completedAt =
        new Date();

      // --------------------------------
      // SETTLE ACCOUNT
      // --------------------------------

      await tx.tradingAccount.update({
        where: {
          id: account.id,
        },

        data: {
          balance: {
            decrement:
              withdrawal.amount,
          },

          reservedBalance: {
            decrement:
              withdrawal.amount,
          },
        },
      });

      // --------------------------------
      // COMPLETE PAYOUT ATTEMPT
      // --------------------------------

      await tx.payoutAttempt.update({
        where: {
          id: payoutAttempt.id,
        },

        data: {
          status:
            "COMPLETED",

          completedAt,
        },
      });

      // --------------------------------
      // COMPLETE TRANSACTION
      // --------------------------------

      const completedWithdrawal =
        await tx.fundTransaction.update({
          where: {
            id: withdrawal.id,
          },

          data: {
            status:
              "COMPLETED",

            completedAt,
          },
        });

      return completedWithdrawal;
    },

    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .Serializable,
    }
  );
};


// ======================================================
// FAIL WITHDRAWAL
//
// Called after payout processing fails.
// Reserved funds are returned to availability.
// ======================================================

export const failWithdrawal = async (
  transactionId: string,
  failureCode?: string,
  failureMessage?: string
) => {
  return prisma.$transaction(
    async (tx) => {
      // --------------------------------
      // FIND WITHDRAWAL
      // --------------------------------

      const withdrawal =
        await tx.fundTransaction.findUnique({
          where: {
            id: transactionId,
          },

          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            accountId: true,
          },
        });

      if (!withdrawal) {
        throw new Error(
          "WITHDRAWAL_NOT_FOUND"
        );
      }

      if (
        withdrawal.type !==
        "WITHDRAWAL"
      ) {
        throw new Error(
          "INVALID_TRANSACTION_TYPE"
        );
      }

      // --------------------------------
      // IDEMPOTENCY
      // --------------------------------

      if (
        withdrawal.status ===
          "FAILED" ||
        withdrawal.status ===
          "REJECTED" ||
        withdrawal.status ===
          "CANCELLED"
      ) {
        return withdrawal;
      }

      if (
        withdrawal.status !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PENDING"
        );
      }

      if (!withdrawal.accountId) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      // --------------------------------
      // FIND PAYOUT ATTEMPT
      // --------------------------------

      const payoutAttempt =
        await tx.payoutAttempt.findFirst({
          where: {
            fundTransactionId:
              withdrawal.id,

            status: {
              in: [
                "PENDING",
                "PROCESSING",
              ],
            },
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      if (!payoutAttempt) {
        throw new Error(
          "PAYOUT_ATTEMPT_NOT_FOUND"
        );
      }

      // --------------------------------
      // FIND ACCOUNT
      // --------------------------------

      const account =
        await tx.tradingAccount.findUnique({
          where: {
            id: withdrawal.accountId,
          },

          select: {
            id: true,
            reservedBalance: true,
          },
        });

      if (!account) {
        throw new Error(
          "WITHDRAWAL_ACCOUNT_NOT_FOUND"
        );
      }

      if (
        account.reservedBalance.lessThan(
          withdrawal.amount
        )
      ) {
        throw new Error(
          "INVALID_RESERVED_BALANCE"
        );
      }

      const failedAt =
        new Date();

      // --------------------------------
      // RELEASE RESERVED FUNDS
      // --------------------------------

      await tx.tradingAccount.update({
        where: {
          id: account.id,
        },

        data: {
          reservedBalance: {
            decrement:
              withdrawal.amount,
          },
        },
      });

      // --------------------------------
      // FAIL PAYOUT ATTEMPT
      // --------------------------------

      await tx.payoutAttempt.update({
        where: {
          id: payoutAttempt.id,
        },

        data: {
          status:
            "FAILED",

          failedAt,

          failureCode:
            failureCode ?? null,

          failureMessage:
            failureMessage ?? null,
        },
      });

      // --------------------------------
      // FAIL FUND TRANSACTION
      // --------------------------------

      const failedWithdrawal =
        await tx.fundTransaction.update({
          where: {
            id: withdrawal.id,
          },

          data: {
            status:
              "FAILED",
          },
        });

      return failedWithdrawal;
    },

    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .Serializable,
    }
  );
};

// ============================================================
// PROCESS WITHDRAWAL
// ============================================================

type ProcessWithdrawalInput = {
  adminUserId: string;
  transactionId: string;
  provider: PaymentProvider;
};

export const processWithdrawal = async ({
  adminUserId,
  transactionId,
  provider,
}: ProcessWithdrawalInput) => {
  return prisma.$transaction(
    async (tx) => {
      // --------------------------------
      // FIND WITHDRAWAL
      // --------------------------------

      const withdrawal =
        await tx.fundTransaction.findUnique({
          where: {
            id: transactionId,
          },

          select: {
            id: true,
            reference: true,
            type: true,
            status: true,

            amount: true,
            currency: true,

            convertedAmount: true,
            convertedCurrency: true,

            accountId: true,

            withdrawalApprovalStatus: true,

            payoutAttempts: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });

      if (!withdrawal) {
        throw new Error(
          "WITHDRAWAL_NOT_FOUND"
        );
      }

      if (
        withdrawal.type !==
        "WITHDRAWAL"
      ) {
        throw new Error(
          "INVALID_TRANSACTION_TYPE"
        );
      }

      if (
        withdrawal.status !==
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PENDING"
        );
      }

      // --------------------------------
      // CHECK APPROVAL
      // --------------------------------

      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "PENDING"
      ) {
        throw new Error(
          "WITHDRAWAL_APPROVAL_REQUIRED"
        );
      }

      if (
        withdrawal
          .withdrawalApprovalStatus ===
        "REJECTED"
      ) {
        throw new Error(
          "WITHDRAWAL_REJECTED"
        );
      }

      /*
       * Allowed:
       *
       * NOT_REQUIRED -> <= $100
       * APPROVED     -> > $100 approved
       */

      if (
        withdrawal
          .withdrawalApprovalStatus !==
          "NOT_REQUIRED" &&
        withdrawal
          .withdrawalApprovalStatus !==
          "APPROVED"
      ) {
        throw new Error(
          "WITHDRAWAL_NOT_PROCESSABLE"
        );
      }

      // --------------------------------
      // VALIDATE PAYOUT DATA
      // --------------------------------

      if (
        !withdrawal.convertedAmount ||
        !withdrawal.convertedCurrency
      ) {
        throw new Error(
          "WITHDRAWAL_PAYOUT_DATA_MISSING"
        );
      }

      // --------------------------------
      // PREVENT DUPLICATE PAYOUT
      // --------------------------------

      if (
        withdrawal.payoutAttempts
          .length > 0
      ) {
        throw new Error(
          "PAYOUT_ATTEMPT_ALREADY_EXISTS"
        );
      }

      // --------------------------------
      // CREATE PAYOUT ATTEMPT
      // --------------------------------

      const payoutAttempt =
        await tx.payoutAttempt.create({
          data: {
            fundTransactionId:
              withdrawal.id,

            provider,

            status:
              "PENDING",

            amount:
              withdrawal.convertedAmount,

            currency:
              withdrawal.convertedCurrency,
          },
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return {
        withdrawal: {
          id:
            withdrawal.id,

          reference:
            withdrawal.reference,

          status:
            withdrawal.status,

          approvalStatus:
            withdrawal
              .withdrawalApprovalStatus,
        },

        payoutAttempt: {
          id:
            payoutAttempt.id,

          provider:
            payoutAttempt.provider,

          status:
            payoutAttempt.status,

          amount:
            payoutAttempt.amount.toString(),

          currency:
            payoutAttempt.currency,
        },

        processedBy:
          adminUserId,
      };
    },

    {
      isolationLevel:
        Prisma
          .TransactionIsolationLevel
          .Serializable,
    }
  );
};

// ======================================================
// TRANSFER TYPES
// ======================================================

type CreateTransferInput = {
  userId: string;
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  amount: number;
  idempotencyKey: string;
};

// ======================================================
// CREATE TRANSFER
//
// Version 1:
// Transfer only between the authenticated customer's
// own trading accounts.
// ======================================================

export const createTransfer = async ({
  userId,
  sourceAccountNumber,
  destinationAccountNumber,
  amount,
  idempotencyKey,
}: CreateTransferInput) => {
  // --------------------------------
  // IDEMPOTENCY HASH
  // --------------------------------

  const requestHash =
    createIdempotencyRequestHash({
      operation: "TRANSFER",
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
    });

  // --------------------------------
  // SAME ACCOUNT CHECK
  // --------------------------------

  if (
    sourceAccountNumber ===
    destinationAccountNumber
  ) {
    throw new Error(
      "SAME_TRANSFER_ACCOUNT"
    );
  }

  // --------------------------------
  // FIND CUSTOMER
  // --------------------------------

  const customer =
    await prisma.customer.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

  if (!customer) {
    throw new Error(
      "CUSTOMER_NOT_FOUND"
    );
  }

  if (!customer.isActive) {
    throw new Error(
      "CUSTOMER_INACTIVE"
    );
  }

  // --------------------------------
  // CHECK EXISTING IDEMPOTENCY KEY
  // --------------------------------

  const existingRequest =
    await prisma.idempotencyRequest.findUnique({
      where: {
        userId_key: {
          userId,
          key: idempotencyKey,
        },
      },
    });

  if (existingRequest) {
    // Same key but different request
    if (
      existingRequest.requestHash !==
      requestHash
    ) {
      throw new Error(
        "IDEMPOTENCY_KEY_CONFLICT"
      );
    }

    // Request currently being processed
    if (
      existingRequest.status ===
      "PROCESSING"
    ) {
      throw new Error(
        "IDEMPOTENCY_REQUEST_PROCESSING"
      );
    }

    // --------------------------------
    // RETURN EXISTING COMPLETED TRANSFER
    // --------------------------------

    if (
      existingRequest.status ===
        "COMPLETED" &&
      existingRequest.fundTransactionId
    ) {
      const existingTransaction =
        await prisma.fundTransaction.findFirst({
          where: {
            id:
              existingRequest
                .fundTransactionId,

            customerId:
              customer.id,

            type:
              "TRANSFER",
          },

          select: {
            id: true,
            reference: true,
            status: true,

            amount: true,
            currency: true,

            convertedAmount: true,
            convertedCurrency: true,

            exchangeRate: true,
            exchangeRateSource: true,

            completedAt: true,

            sourceAccount: {
              select: {
                id: true,
                accountNumber: true,
                balance: true,
                reservedBalance: true,
              },
            },

            destinationAccount: {
              select: {
                id: true,
                accountNumber: true,
                balance: true,
              },
            },
          },
        });

      if (
        !existingTransaction ||
        !existingTransaction.sourceAccount ||
        !existingTransaction.destinationAccount ||
        !existingTransaction.convertedAmount ||
        !existingTransaction.convertedCurrency ||
        !existingTransaction.exchangeRate
      ) {
        throw new Error(
          "IDEMPOTENCY_TRANSACTION_NOT_FOUND"
        );
      }

      return {
        transactionId:
          existingTransaction.id,

        reference:
          existingTransaction.reference,

        status:
          existingTransaction.status,

        source: {
          accountId:
            existingTransaction
              .sourceAccount.id,

          accountNumber:
            existingTransaction
              .sourceAccount
              .accountNumber,

          amount:
            existingTransaction
              .amount
              .toString(),

          currency:
            existingTransaction.currency,

          balance:
            existingTransaction
              .sourceAccount
              .balance
              .toString(),

          reservedBalance:
            existingTransaction
              .sourceAccount
              .reservedBalance
              .toString(),
        },

        destination: {
          accountId:
            existingTransaction
              .destinationAccount.id,

          accountNumber:
            existingTransaction
              .destinationAccount
              .accountNumber,

          amount:
            existingTransaction
              .convertedAmount
              .toString(),

          currency:
            existingTransaction
              .convertedCurrency,

          balance:
            existingTransaction
              .destinationAccount
              .balance
              .toString(),
        },

        conversion: {
          exchangeRate:
            existingTransaction
              .exchangeRate
              .toString(),

          exchangeRateSource:
            existingTransaction
              .exchangeRateSource,
        },

        completedAt:
          existingTransaction.completedAt,

        idempotentReplay: true,
      };
    }

    throw new Error(
      "IDEMPOTENCY_REQUEST_INVALID_STATE"
    );
  }

  // --------------------------------
  // FIND SOURCE ACCOUNT
  // --------------------------------

  const sourceAccount =
    await prisma.tradingAccount.findUnique({
      where: {
        accountNumber:
          sourceAccountNumber,
      },

      select: {
        id: true,
        accountNumber: true,
        customerId: true,
        currency: true,
        balance: true,
        reservedBalance: true,
        status: true,
      },
    });

  if (
    !sourceAccount ||
    sourceAccount.customerId !==
      customer.id
  ) {
    throw new Error(
      "SOURCE_ACCOUNT_NOT_FOUND"
    );
  }

  if (
    sourceAccount.status !== "ACTIVE"
  ) {
    throw new Error(
      "SOURCE_ACCOUNT_NOT_ACTIVE"
    );
  }

  // --------------------------------
  // FIND DESTINATION ACCOUNT
  // --------------------------------

  const destinationAccount =
    await prisma.tradingAccount.findUnique({
      where: {
        accountNumber:
          destinationAccountNumber,
      },

      select: {
        id: true,
        accountNumber: true,
        customerId: true,
        currency: true,
        status: true,
      },
    });

  if (
    !destinationAccount ||
    destinationAccount.customerId !==
      customer.id
  ) {
    throw new Error(
      "DESTINATION_ACCOUNT_NOT_FOUND"
    );
  }

  if (
    destinationAccount.status !==
      "ACTIVE"
  ) {
    throw new Error(
      "DESTINATION_ACCOUNT_NOT_ACTIVE"
    );
  }

  // --------------------------------
  // DEFENSIVE SAME ACCOUNT CHECK
  // --------------------------------

  if (
    sourceAccount.id ===
    destinationAccount.id
  ) {
    throw new Error(
      "SAME_TRANSFER_ACCOUNT"
    );
  }

  // --------------------------------
  // TRANSFER AMOUNT
  // --------------------------------

  const transferAmount =
    new Prisma.Decimal(
      amount.toString()
    ).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP
    );

  if (
    transferAmount.lessThanOrEqualTo(0)
  ) {
    throw new Error(
      "INVALID_TRANSFER_AMOUNT"
    );
  }

  // --------------------------------
  // AVAILABLE BALANCE
  // --------------------------------

  const availableBalance =
    sourceAccount.balance.minus(
      sourceAccount.reservedBalance
    );

  if (
    availableBalance.lessThan(
      transferAmount
    )
  ) {
    throw new Error(
      "INSUFFICIENT_AVAILABLE_BALANCE"
    );
  }

  // --------------------------------
  // CURRENCIES
  // --------------------------------

  const sourceCurrency =
    sourceAccount.currency
      .trim()
      .toUpperCase();

  const destinationCurrency =
    destinationAccount.currency
      .trim()
      .toUpperCase();

  // --------------------------------
  // FX
  // --------------------------------

  let exchangeRate:
    Prisma.Decimal;

  let exchangeRateSource:
    string;

  if (
    sourceCurrency ===
    destinationCurrency
  ) {
    exchangeRate =
      new Prisma.Decimal("1");

    exchangeRateSource =
      "INTERNAL";
  } else {
    const quote =
      await getExchangeRate(
        sourceCurrency,
        destinationCurrency
      );

    exchangeRate =
      quote.rate;

    exchangeRateSource =
      quote.source;
  }

  // --------------------------------
  // DESTINATION AMOUNT
  // --------------------------------

  const destinationAmount =
    transferAmount
      .mul(exchangeRate)
      .toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP
      );

  if (
    destinationAmount.lessThanOrEqualTo(
      0
    )
  ) {
    throw new Error(
      "INVALID_CONVERTED_AMOUNT"
    );
  }

  // --------------------------------
  // REFERENCE
  // --------------------------------

  const reference =
    `TRF-${randomUUID()
      .replace(/-/g, "")
      .slice(0, 16)
      .toUpperCase()}`;

  // --------------------------------
  // ATOMIC TRANSFER
  //
  // Idempotency + balance movement +
  // FundTransaction are committed
  // together.
  // --------------------------------

  const result =
    await prisma.$transaction(
      async (tx) => {
        // --------------------------------
        // CLAIM IDEMPOTENCY KEY
        //
        // upsert also protects us when two
        // identical requests arrive together.
        // --------------------------------

        const idempotencyRequest =
          await tx.idempotencyRequest.upsert({
            where: {
              userId_key: {
                userId,
                key:
                  idempotencyKey,
              },
            },

            create: {
              userId,
              key:
                idempotencyKey,

              operation:
                "TRANSFER",

              requestHash,

              status:
                "PROCESSING",
            },

            update: {},
          });

        // --------------------------------
        // SAME KEY, DIFFERENT REQUEST
        // --------------------------------

        if (
          idempotencyRequest.requestHash !==
          requestHash
        ) {
          throw new Error(
            "IDEMPOTENCY_KEY_CONFLICT"
          );
        }

        // --------------------------------
        // ANOTHER REQUEST ALREADY FINISHED
        // --------------------------------

        if (
          idempotencyRequest.status ===
            "COMPLETED" &&
          idempotencyRequest
            .fundTransactionId
        ) {
          const previousTransaction =
            await tx.fundTransaction.findFirst({
              where: {
                id:
                  idempotencyRequest
                    .fundTransactionId,

                customerId:
                  customer.id,

                type:
                  "TRANSFER",
              },

              select: {
                id: true,
                reference: true,
                status: true,

                amount: true,
                currency: true,

                convertedAmount: true,
                convertedCurrency: true,

                exchangeRate: true,
                exchangeRateSource: true,

                completedAt: true,

                sourceAccount: {
                  select: {
                    id: true,
                    accountNumber: true,
                    balance: true,
                    reservedBalance: true,
                  },
                },

                destinationAccount: {
                  select: {
                    id: true,
                    accountNumber: true,
                    balance: true,
                    reservedBalance: true,
                  },
                },
              },
            });

          if (!previousTransaction) {
            throw new Error(
              "IDEMPOTENCY_TRANSACTION_NOT_FOUND"
            );
          }

          return {
            replay: true as const,
            fundTransaction:
              previousTransaction,
            updatedSource:
              previousTransaction
                .sourceAccount,
            updatedDestination:
              previousTransaction
                .destinationAccount,
          };
        }

        // --------------------------------
        // RE-READ SOURCE ACCOUNT
        // --------------------------------

        const currentSource =
          await tx.tradingAccount.findUnique({
            where: {
              id:
                sourceAccount.id,
            },

            select: {
              id: true,
              customerId: true,
              currency: true,
              balance: true,
              reservedBalance: true,
              status: true,
            },
          });

        if (
          !currentSource ||
          currentSource.customerId !==
            customer.id
        ) {
          throw new Error(
            "SOURCE_ACCOUNT_NOT_FOUND"
          );
        }

        if (
          currentSource.status !==
            "ACTIVE"
        ) {
          throw new Error(
            "SOURCE_ACCOUNT_NOT_ACTIVE"
          );
        }

        // --------------------------------
        // RE-READ DESTINATION ACCOUNT
        // --------------------------------

        const currentDestination =
          await tx.tradingAccount.findUnique({
            where: {
              id:
                destinationAccount.id,
            },

            select: {
              id: true,
              customerId: true,
              currency: true,
              status: true,
            },
          });

        if (
          !currentDestination ||
          currentDestination.customerId !==
            customer.id
        ) {
          throw new Error(
            "DESTINATION_ACCOUNT_NOT_FOUND"
          );
        }

        if (
          currentDestination.status !==
            "ACTIVE"
        ) {
          throw new Error(
            "DESTINATION_ACCOUNT_NOT_ACTIVE"
          );
        }

        // --------------------------------
        // RE-CHECK AVAILABLE BALANCE
        // --------------------------------

        const currentAvailableBalance =
          currentSource.balance.minus(
            currentSource.reservedBalance
          );

        if (
          currentAvailableBalance.lessThan(
            transferAmount
          )
        ) {
          throw new Error(
            "INSUFFICIENT_AVAILABLE_BALANCE"
          );
        }

        // --------------------------------
        // DEBIT SOURCE
        // --------------------------------

        const updatedSource =
          await tx.tradingAccount.update({
            where: {
              id:
                currentSource.id,
            },

            data: {
              balance: {
                decrement:
                  transferAmount,
              },
            },

            select: {
              id: true,
              accountNumber: true,
              currency: true,
              balance: true,
              reservedBalance: true,
            },
          });

        // --------------------------------
        // CREDIT DESTINATION
        // --------------------------------

        const updatedDestination =
          await tx.tradingAccount.update({
            where: {
              id:
                currentDestination.id,
            },

            data: {
              balance: {
                increment:
                  destinationAmount,
              },
            },

            select: {
              id: true,
              accountNumber: true,
              currency: true,
              balance: true,
              reservedBalance: true,
            },
          });

        // --------------------------------
        // CREATE FUND TRANSACTION
        // --------------------------------

        const completedAt =
          new Date();

        const fundTransaction =
          await tx.fundTransaction.create({
            data: {
              customerId:
                customer.id,

              type:
                "TRANSFER",

              status:
                "COMPLETED",

              amount:
                transferAmount,

              currency:
                sourceCurrency,

              convertedAmount:
                destinationAmount,

              convertedCurrency:
                destinationCurrency,

              exchangeRate,

              exchangeRateSource,

              sourceAccountId:
                sourceAccount.id,

              destinationAccountId:
                destinationAccount.id,

              reference,

              completedAt,
            },
          });

        // --------------------------------
        // COMPLETE IDEMPOTENCY REQUEST
        // --------------------------------

        await tx.idempotencyRequest.update({
          where: {
            id:
              idempotencyRequest.id,
          },

          data: {
            status:
              "COMPLETED",

            fundTransactionId:
              fundTransaction.id,
          },
        });

        return {
          replay: false as const,
          fundTransaction,
          updatedSource,
          updatedDestination,
        };
      },

      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      }
    );

  // --------------------------------
  // DEFENSIVE RESULT CHECK
  // --------------------------------

  if (
    !result.updatedSource ||
    !result.updatedDestination
  ) {
    throw new Error(
      "IDEMPOTENCY_TRANSACTION_NOT_FOUND"
    );
  }

  if (
    !result.fundTransaction
      .convertedAmount ||
    !result.fundTransaction
      .convertedCurrency ||
    !result.fundTransaction
      .exchangeRate
  ) {
    throw new Error(
      "INVALID_TRANSFER_TRANSACTION"
    );
  }

  // --------------------------------
  // RESPONSE
  // --------------------------------

  return {
    transactionId:
      result.fundTransaction.id,

    reference:
      result.fundTransaction.reference,

    status:
      result.fundTransaction.status,

    source: {
      accountId:
        result.updatedSource.id,

      accountNumber:
        result.updatedSource
          .accountNumber,

      amount:
        result.fundTransaction
          .amount
          .toString(),

      currency:
        result.fundTransaction
          .currency,

      balance:
        result.updatedSource
          .balance
          .toString(),

      reservedBalance:
        result.updatedSource
          .reservedBalance
          .toString(),
    },

    destination: {
      accountId:
        result.updatedDestination.id,

      accountNumber:
        result.updatedDestination
          .accountNumber,

      amount:
        result.fundTransaction
          .convertedAmount
          .toString(),

      currency:
        result.fundTransaction
          .convertedCurrency,

      balance:
        result.updatedDestination
          .balance
          .toString(),
    },

    conversion: {
      exchangeRate:
        result.fundTransaction
          .exchangeRate
          .toString(),

      exchangeRateSource:
        result.fundTransaction
          .exchangeRateSource,
    },

    completedAt:
      result.fundTransaction
        .completedAt,

    idempotentReplay:
      result.replay,
  };
};


// ======================================================
// TRANSACTION HISTORY TYPES
// ======================================================

type TransactionHistoryFilters = {
  type?:
    | "DEPOSIT"
    | "WITHDRAWAL"
    | "TRANSFER";

  status?:
    | "PENDING"
    | "COMPLETED"
    | "FAILED"
    | "REJECTED";

  accountNumber?: string;
  reference?: string;
  currency?: string;
  fromDate?: string;
  toDate?: string;
};

type GetTransactionHistoryInput = {
  userId: string;
  page?: number;
  pageSize?: number;
  filters?: TransactionHistoryFilters;
};

// ======================================================
// GET TRANSACTION HISTORY
// ======================================================

export const getTransactionHistory =
  async ({
    userId,
    page = 1,
    pageSize = 10,
    filters = {},
  }: GetTransactionHistoryInput) => {

    // --------------------------------
    // FIND CUSTOMER
    // --------------------------------

    const customer =
      await prisma.customer.findUnique({
        where: {
          userId,
        },

        select: {
          id: true,
          isActive: true,
        },
      });

    if (!customer) {
      throw new Error(
        "CUSTOMER_NOT_FOUND"
      );
    }

    if (!customer.isActive) {
      throw new Error(
        "CUSTOMER_INACTIVE"
      );
    }

    // --------------------------------
    // PAGINATION
    // --------------------------------

    const currentPage =
      Math.max(1, page);

    const currentPageSize =
      Math.min(
        Math.max(1, pageSize),
        100
      );

    const skip =
      (currentPage - 1) *
      currentPageSize;

    // --------------------------------
    // BUILD WHERE CONDITION
    // --------------------------------

    const where:
      Prisma.FundTransactionWhereInput = {
        customerId:
          customer.id,
      };

    // --------------------------------
    // TYPE FILTER
    // --------------------------------

    if (filters.type) {
      where.type =
        filters.type;
    }

    // --------------------------------
    // STATUS FILTER
    // --------------------------------

    if (filters.status) {
      where.status =
        filters.status;
    }

    // --------------------------------
    // REFERENCE FILTER
    // --------------------------------

    if (filters.reference) {
      where.reference = {
        contains:
          filters.reference,

        mode:
          "insensitive",
      };
    }

    // --------------------------------
    // CURRENCY FILTER
    //
    // Search both source/requested
    // currency and converted currency.
    // --------------------------------

    if (filters.currency) {
      const currency =
        filters.currency
          .trim()
          .toUpperCase();

      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),

        {
          OR: [
            {
              currency,
            },
            {
              convertedCurrency:
                currency,
            },
          ],
        },
      ];
    }

    // --------------------------------
    // ACCOUNT NUMBER FILTER
    //
    // Deposit / withdrawal:
    // account
    //
    // Transfer:
    // sourceAccount OR
    // destinationAccount
    // --------------------------------

    if (filters.accountNumber) {
      const accountNumber =
        filters.accountNumber.trim();

      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),

        {
          OR: [
            {
              account: {
                is: {
                  accountNumber,
                },
              },
            },

            {
              sourceAccount: {
                is: {
                  accountNumber,
                },
              },
            },

            {
              destinationAccount: {
                is: {
                  accountNumber,
                },
              },
            },
          ],
        },
      ];
    }

    // --------------------------------
    // DATE FILTER
    // --------------------------------

    if (
      filters.fromDate ||
      filters.toDate
    ) {
      where.createdAt = {};

      if (filters.fromDate) {
        where.createdAt.gte =
          new Date(
            filters.fromDate
          );
      }

      if (filters.toDate) {
        where.createdAt.lte =
          new Date(
            filters.toDate
          );
      }
    }

    // --------------------------------
    // COUNT + FETCH
    //
    // Run together so we avoid doing
    // these sequentially.
    // --------------------------------

    const [
      dataCount,
      transactions,
    ] = await prisma.$transaction([
      prisma.fundTransaction.count({
        where,
      }),

      prisma.fundTransaction.findMany({
        where,

        skip,

        take:
          currentPageSize,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        select: {
          id: true,
          reference: true,

          type: true,
          status: true,

          amount: true,
          currency: true,

          convertedAmount: true,
          convertedCurrency: true,

          exchangeRate: true,
          exchangeRateSource: true,

          withdrawalApprovalStatus:
            true,

          completedAt: true,
          createdAt: true,

          account: {
            select: {
              id: true,
              accountNumber: true,
              currency: true,
            },
          },

          sourceAccount: {
            select: {
              id: true,
              accountNumber: true,
              currency: true,
            },
          },

          destinationAccount: {
            select: {
              id: true,
              accountNumber: true,
              currency: true,
            },
          },
        },
      }),
    ]);

    // --------------------------------
    // PAGE COUNT
    // --------------------------------

    const pageCount =
      Math.ceil(
        dataCount /
          currentPageSize
      );

    // --------------------------------
    // FORMAT PAGE DATA
    // --------------------------------

    const pageData =
      transactions.map(
        (transaction) => {
          return {
            transactionId:
              transaction.id,

            reference:
              transaction.reference,

            type:
              transaction.type,

            status:
              transaction.status,

            amount:
              transaction.amount
                .toString(),

            currency:
              transaction.currency,

            convertedAmount:
              transaction
                .convertedAmount
                ?.toString() ??
              null,

            convertedCurrency:
              transaction
                .convertedCurrency,

            conversion: {
              exchangeRate:
                transaction
                  .exchangeRate
                  ?.toString() ??
                null,

              exchangeRateSource:
                transaction
                  .exchangeRateSource,
            },

            account:
              transaction.account
                ? {
                    id:
                      transaction
                        .account.id,

                    accountNumber:
                      transaction
                        .account
                        .accountNumber,

                    currency:
                      transaction
                        .account
                        .currency,
                  }
                : null,

            sourceAccount:
              transaction
                .sourceAccount
                ? {
                    id:
                      transaction
                        .sourceAccount
                        .id,

                    accountNumber:
                      transaction
                        .sourceAccount
                        .accountNumber,

                    currency:
                      transaction
                        .sourceAccount
                        .currency,
                  }
                : null,

            destinationAccount:
              transaction
                .destinationAccount
                ? {
                    id:
                      transaction
                        .destinationAccount
                        .id,

                    accountNumber:
                      transaction
                        .destinationAccount
                        .accountNumber,

                    currency:
                      transaction
                        .destinationAccount
                        .currency,
                  }
                : null,

            approvalStatus:
              transaction
                .withdrawalApprovalStatus,

            completedAt:
              transaction.completedAt,

            createdAt:
              transaction.createdAt,
          };
        }
      );

    // --------------------------------
    // RESPONSE
    // --------------------------------

    return {
      page:
        currentPage,

      pageSize:
        currentPageSize,

      dataCount,

      pageCount,

      pageData,
    };
  };
