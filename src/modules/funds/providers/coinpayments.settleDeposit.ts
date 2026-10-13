
import prisma from "../../../db/db.config.js";

type SettleDepositInput = {
  paymentAttemptId: string;
  providerReference: string;
};

export async function settleCoinPaymentsDeposit(
  input: SettleDepositInput
): Promise<"COMPLETED" | "ALREADY_PROCESSED"> {
  return prisma.$transaction(async (tx) => {
    const paymentAttempt =
      await tx.paymentAttempt.findUnique({
        where: {
          id: input.paymentAttemptId,
        },
        include: {
          fundTransaction: true,
        },
      });

    if (!paymentAttempt) {
      throw new Error("COINPAYMENTS_PAYMENT_ATTEMPT_NOT_FOUND");
    }

    if (
      paymentAttempt.provider !== "COINPAYMENTS" ||
      paymentAttempt.providerReference !==
        input.providerReference
    ) {
      throw new Error("COINPAYMENTS_REFERENCE_MISMATCH");
    }

    if (paymentAttempt.status === "COMPLETED") {
      return "ALREADY_PROCESSED";
    }

    if (paymentAttempt.status !== "PENDING") {
      throw new Error("COINPAYMENTS_INVALID_PAYMENT_STATUS");
    }

    const fundTransaction =
      paymentAttempt.fundTransaction;

    if (
      fundTransaction.type !== "DEPOSIT" ||
      fundTransaction.status !== "PENDING" ||
      !fundTransaction.accountId ||
      !fundTransaction.convertedAmount ||
      !fundTransaction.convertedCurrency
    ) {
      throw new Error("COINPAYMENTS_INVALID_DEPOSIT");
    }

    if (fundTransaction.convertedAmount.lte(0)) {
      throw new Error("COINPAYMENTS_INVALID_CREDIT_AMOUNT");
    }

    const tradingAccount =
      await tx.tradingAccount.findUnique({
        where: {
          id: fundTransaction.accountId,
        },
      });

    if (
      !tradingAccount ||
      tradingAccount.customerId !==
        fundTransaction.customerId ||
      tradingAccount.currency.toUpperCase() !==
        fundTransaction.convertedCurrency.toUpperCase() ||
      tradingAccount.status !== "ACTIVE"
    ) {
      throw new Error("COINPAYMENTS_TRADING_ACCOUNT_MISMATCH");
    }

    // Atomically claim this payment attempt.
    const claimed =
      await tx.paymentAttempt.updateMany({
        where: {
          id: paymentAttempt.id,
          provider: "COINPAYMENTS",
          providerReference: input.providerReference,
          status: "PENDING",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

    // A concurrent webhook may have settled it already.
    if (claimed.count === 0) {
      return "ALREADY_PROCESSED";
    }

    // Complete the deposit transaction.
    const completed =
      await tx.fundTransaction.updateMany({
        where: {
          id: fundTransaction.id,
          status: "PENDING",
          type: "DEPOSIT",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

    if (completed.count !== 1) {
      throw new Error(
        "COINPAYMENTS_DEPOSIT_STATE_CONFLICT"
      );
    }

    // Credit the trading account inside the same
    // database transaction.
    const credited =
      await tx.tradingAccount.updateMany({
        where: {
          id: tradingAccount.id,
          customerId: fundTransaction.customerId,
          currency: tradingAccount.currency,
          status: "ACTIVE",
        },
        data: {
          balance: {
            increment: fundTransaction.convertedAmount,
          },
        },
      });

    if (credited.count !== 1) {
      throw new Error(
        "COINPAYMENTS_ACCOUNT_CREDIT_FAILED"
      );
    }

    return "COMPLETED";
  });
}
