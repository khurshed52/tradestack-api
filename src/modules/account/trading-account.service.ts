import prisma from "../../db/db.config.js";

export class TradingAccountLookupError extends Error {
  constructor(
    public readonly code:
      | "CUSTOMER_NOT_FOUND"
      | "CUSTOMER_INACTIVE"
  ) {
    super(code);
    this.name = "TradingAccountLookupError";
  }
}


export async function listMyTradingAccounts(
  userId: string
) {
  // --------------------------------
  // 1. FIND AUTHENTICATED CUSTOMER
  // --------------------------------

  const customer = await prisma.customer.findUnique({
    where: { userId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!customer) {
    throw new TradingAccountLookupError(
      "CUSTOMER_NOT_FOUND"
    );
  }

  if (!customer.isActive) {
    throw new TradingAccountLookupError(
      "CUSTOMER_INACTIVE"
    );
  }

  // --------------------------------
  // 2. FETCH CUSTOMER ACCOUNTS
  // --------------------------------

  const accounts = await prisma.tradingAccount.findMany({
    where: {
      customerId: customer.id,
    },

    select: {
      id: true,
      accountNumber: true,
      platform: true,
      currency: true,
      balance: true,
      reservedBalance: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  // --------------------------------
  // 3. CALCULATE AVAILABLE BALANCE
  // --------------------------------

  return accounts.map((account) => {
    const availableBalance =
      account.balance.minus(
        account.reservedBalance
      );

    return {
      id: account.id,
      accountNumber: account.accountNumber,
      platform: account.platform,
      currency: account.currency,

      // Preserve decimal precision.
      balance: account.balance.toFixed(2),

      // Available balance cannot be negative.
      availableBalance:
        availableBalance.isNegative()
          ? "0.00"
          : availableBalance.toFixed(2),

      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  });
}
