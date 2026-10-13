
import prisma from "../../db/db.config.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  ReportRequest,
  ReportResponse,
} from "./reports.validation.js";

export async function getDepositReport(
  input: ReportRequest,
  userId: string
): Promise<ReportResponse<unknown>> {
  const { page, pageSize, filters } = input;

  // --------------------------------------------------
  // VALIDATE PAGINATION
  // --------------------------------------------------
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    throw new Error("INVALID_REPORT_PAGINATION");
  }

  // --------------------------------------------------
  // RESOLVE AUTHENTICATED CUSTOMER
  // --------------------------------------------------
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

  // --------------------------------------------------
  // CUSTOMER-SCOPED DEPOSIT FILTER
  // --------------------------------------------------
  const where: Prisma.FundTransactionWhereInput = {
    type: "DEPOSIT",
    customerId: customer.id,
  };

  // --------------------------------------------------
  // STATUS FILTER
  // --------------------------------------------------
  const allowedStatuses = [
    "PENDING",
    "COMPLETED",
    "FAILED",
    "REJECTED",
    "CANCELLED",
  ] as const;

  if (filters.status) {
    if (
      !allowedStatuses.includes(
        filters.status as (typeof allowedStatuses)[number]
      )
    ) {
      throw new Error("INVALID_REPORT_STATUS");
    }

    where.status =
      filters.status as (typeof allowedStatuses)[number];
  }

  // --------------------------------------------------
  // REFERENCE FILTER
  // --------------------------------------------------
  if (filters.reference) {
    where.reference = {
      contains: filters.reference,
      mode: "insensitive",
    };
  }

  // --------------------------------------------------
  // DATE FILTER
  // --------------------------------------------------
  if (filters.dateFrom || filters.dateTo) {
    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : undefined;

    const dateTo = filters.dateTo
      ? new Date(filters.dateTo)
      : undefined;

    if (
      (dateFrom && Number.isNaN(dateFrom.getTime())) ||
      (dateTo && Number.isNaN(dateTo.getTime()))
    ) {
      throw new Error("INVALID_REPORT_DATE");
    }

    if (
      dateFrom &&
      dateTo &&
      dateFrom.getTime() > dateTo.getTime()
    ) {
      throw new Error("INVALID_REPORT_DATE_RANGE");
    }

    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  // --------------------------------------------------
  // TRADING ACCOUNT FILTER
  // --------------------------------------------------
  if (filters.tradingAccount) {
    where.account = {
      is: {
        accountNumber: filters.tradingAccount,
        customerId: customer.id,
      },
    };
  }

  // --------------------------------------------------
  // PAYMENT METHOD FILTER
  // --------------------------------------------------
  const allowedPaymentMethods = [
    "STRIPE",
    "MOCK",
    "COINPAYMENTS",
  ] as const;

  if (filters.paymentMethod) {
    if (
      !allowedPaymentMethods.includes(
        filters.paymentMethod as
          (typeof allowedPaymentMethods)[number]
      )
    ) {
      throw new Error("INVALID_REPORT_PAYMENT_METHOD");
    }

    where.paymentAttempts = {
      some: {
        provider: filters.paymentMethod as
          (typeof allowedPaymentMethods)[number],
      },
    };
  }

  // --------------------------------------------------
  // QUERY DEPOSIT TRANSACTIONS
  // --------------------------------------------------
  const [dataCount, transactions] =
    await prisma.$transaction([
      prisma.fundTransaction.count({
        where,
      }),

      prisma.fundTransaction.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
          createdAt: true,
          completedAt: true,

          account: {
            select: {
              id: true,
              accountNumber: true,
              currency: true,
            },
          },

          paymentAttempts: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              provider: true,
              status: true,
            },
          },
        },
      }),
    ]);

  // --------------------------------------------------
  // FORMAT REPORT ROWS
  // --------------------------------------------------
  const pageData = transactions.map((transaction) => ({
    id: transaction.id,
    reference: transaction.reference,
    type: transaction.type,
    status: transaction.status,

    tradingAccount:
      transaction.account?.accountNumber ?? null,

    amount: transaction.amount.toString(),
    currency: transaction.currency,

    convertedAmount:
      transaction.convertedAmount?.toString() ?? null,

    convertedCurrency: transaction.convertedCurrency,

    exchangeRate:
      transaction.exchangeRate?.toString() ?? null,

    exchangeRateSource:
      transaction.exchangeRateSource,

    paymentMethod:
      transaction.paymentAttempts[0]?.provider ?? null,

    createdAt: transaction.createdAt,
    completedAt: transaction.completedAt,
  }));

  // --------------------------------------------------
  // PAGINATED RESPONSE
  // --------------------------------------------------
  return {
    page,
    pageSize,
    dataCount,
    pageCount: Math.ceil(dataCount / pageSize),
    pageData,
  };
}


export async function getWithdrawalReport(
  input: ReportRequest,
  userId: string
): Promise<ReportResponse<unknown>> {
  const { page, pageSize, filters } = input;

  // --------------------------------------------------
  // VALIDATE PAGINATION
  // --------------------------------------------------
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    throw new Error("INVALID_REPORT_PAGINATION");
  }

  // --------------------------------------------------
  // RESOLVE AUTHENTICATED CUSTOMER
  // --------------------------------------------------
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

  // --------------------------------------------------
  // CUSTOMER-SCOPED WITHDRAWAL FILTER
  // --------------------------------------------------
  const where: Prisma.FundTransactionWhereInput = {
    type: "WITHDRAWAL",
    customerId: customer.id,
  };

  // --------------------------------------------------
  // STATUS FILTER
  // --------------------------------------------------
  const allowedStatuses = [
    "PENDING",
    "COMPLETED",
    "FAILED",
    "REJECTED",
    "CANCELLED",
  ] as const;

  if (filters.status) {
    if (
      !allowedStatuses.includes(
        filters.status as
          (typeof allowedStatuses)[number]
      )
    ) {
      throw new Error("INVALID_REPORT_STATUS");
    }

    where.status = filters.status as
      (typeof allowedStatuses)[number];
  }

  // --------------------------------------------------
  // REFERENCE FILTER
  // --------------------------------------------------
  if (filters.reference) {
    where.reference = {
      contains: filters.reference,
      mode: "insensitive",
    };
  }

  // --------------------------------------------------
  // DATE FILTER
  // --------------------------------------------------
  if (filters.dateFrom || filters.dateTo) {
    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : undefined;

    const dateTo = filters.dateTo
      ? new Date(filters.dateTo)
      : undefined;

    if (
      (dateFrom &&
        Number.isNaN(dateFrom.getTime())) ||
      (dateTo &&
        Number.isNaN(dateTo.getTime()))
    ) {
      throw new Error("INVALID_REPORT_DATE");
    }

    if (
      dateFrom &&
      dateTo &&
      dateFrom.getTime() > dateTo.getTime()
    ) {
      throw new Error(
        "INVALID_REPORT_DATE_RANGE"
      );
    }

    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  // --------------------------------------------------
  // TRADING ACCOUNT FILTER
  // --------------------------------------------------
  if (filters.tradingAccount) {
    where.account = {
      is: {
        accountNumber: filters.tradingAccount,
        customerId: customer.id,
      },
    };
  }

  // --------------------------------------------------
  // WITHDRAWAL APPROVAL STATUS FILTER
  // --------------------------------------------------
  const allowedApprovalStatuses = [
    "NOT_REQUIRED",
    "PENDING",
    "APPROVED",
    "REJECTED",
  ] as const;

  if (filters.withdrawalApprovalStatus) {
    if (
      !allowedApprovalStatuses.includes(
        filters.withdrawalApprovalStatus as
          (typeof allowedApprovalStatuses)[number]
      )
    ) {
      throw new Error(
        "INVALID_REPORT_APPROVAL_STATUS"
      );
    }

    where.withdrawalApprovalStatus =
      filters.withdrawalApprovalStatus as
        (typeof allowedApprovalStatuses)[number];
  }

  // --------------------------------------------------
  // PAYOUT METHOD FILTER
  // --------------------------------------------------
  const allowedPayoutMethods = [
    "STRIPE",
    "MOCK",
    "COINPAYMENTS",
  ] as const;

  if (filters.payoutMethod) {
    if (
      !allowedPayoutMethods.includes(
        filters.payoutMethod as
          (typeof allowedPayoutMethods)[number]
      )
    ) {
      throw new Error(
        "INVALID_REPORT_PAYOUT_METHOD"
      );
    }

    where.payoutAttempts = {
      some: {
        provider: filters.payoutMethod as
          (typeof allowedPayoutMethods)[number],
      },
    };
  }

  // --------------------------------------------------
  // QUERY WITHDRAWAL TRANSACTIONS
  // --------------------------------------------------
  const [dataCount, transactions] =
    await prisma.$transaction([
      prisma.fundTransaction.count({
        where,
      }),

      prisma.fundTransaction.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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

          withdrawalApprovalStatus: true,
          approvedAt: true,
          rejectedAt: true,

          createdAt: true,
          completedAt: true,

          account: {
            select: {
              accountNumber: true,
              currency: true,
            },
          },

          payoutAttempts: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              provider: true,
              status: true,
            },
          },
        },
      }),
    ]);

  // --------------------------------------------------
  // FORMAT WITHDRAWAL REPORT ROWS
  // --------------------------------------------------
  const pageData = transactions.map(
    (transaction) => ({
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      status: transaction.status,

      tradingAccount:
        transaction.account?.accountNumber ??
        null,

      amount: transaction.amount.toString(),
      currency: transaction.currency,

      convertedAmount:
        transaction.convertedAmount?.toString() ??
        null,

      convertedCurrency:
        transaction.convertedCurrency,

      exchangeRate:
        transaction.exchangeRate?.toString() ??
        null,

      exchangeRateSource:
        transaction.exchangeRateSource,

      withdrawalApprovalStatus:
        transaction.withdrawalApprovalStatus,

      payoutMethod:
        transaction.payoutAttempts[0]?.provider ??
        null,

      payoutStatus:
        transaction.payoutAttempts[0]?.status ??
        null,

      approvedAt: transaction.approvedAt,
      rejectedAt: transaction.rejectedAt,

      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    })
  );

  // --------------------------------------------------
  // PAGINATED RESPONSE
  // --------------------------------------------------
  return {
    page,
    pageSize,
    dataCount,
    pageCount: Math.ceil(
      dataCount / pageSize
    ),
    pageData,
  };
}


export async function getTransferReport(
  input: ReportRequest,
  userId: string
): Promise<ReportResponse<unknown>> {
  const { page, pageSize, filters } = input;

  // --------------------------------------------------
  // VALIDATE PAGINATION
  // --------------------------------------------------
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    throw new Error("INVALID_REPORT_PAGINATION");
  }

  // --------------------------------------------------
  // RESOLVE AUTHENTICATED CUSTOMER
  // --------------------------------------------------
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

  // --------------------------------------------------
  // CUSTOMER-SCOPED TRANSFER QUERY
  // --------------------------------------------------
  const where: Prisma.FundTransactionWhereInput = {
    type: "TRANSFER",
    customerId: customer.id,
  };

  // --------------------------------------------------
  // STATUS FILTER
  // --------------------------------------------------
  const allowedStatuses = [
    "PENDING",
    "COMPLETED",
    "FAILED",
    "REJECTED",
    "CANCELLED",
  ] as const;

  if (filters.status) {
    if (
      !allowedStatuses.includes(
        filters.status as
          (typeof allowedStatuses)[number]
      )
    ) {
      throw new Error("INVALID_REPORT_STATUS");
    }

    where.status = filters.status as
      (typeof allowedStatuses)[number];
  }

  // --------------------------------------------------
  // REFERENCE FILTER
  // --------------------------------------------------
  if (filters.reference) {
    where.reference = {
      contains: filters.reference,
      mode: "insensitive",
    };
  }

  // --------------------------------------------------
  // DATE FILTER
  // --------------------------------------------------
  if (filters.dateFrom || filters.dateTo) {
    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : undefined;

    const dateTo = filters.dateTo
      ? new Date(filters.dateTo)
      : undefined;

    if (
      (dateFrom &&
        Number.isNaN(dateFrom.getTime())) ||
      (dateTo &&
        Number.isNaN(dateTo.getTime()))
    ) {
      throw new Error("INVALID_REPORT_DATE");
    }

    if (
      dateFrom &&
      dateTo &&
      dateFrom.getTime() > dateTo.getTime()
    ) {
      throw new Error("INVALID_REPORT_DATE_RANGE");
    }

    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  // --------------------------------------------------
  // SOURCE ACCOUNT FILTER
  // --------------------------------------------------
  if (filters.sourceAccount) {
    where.sourceAccount = {
      is: {
        accountNumber: filters.sourceAccount,
        customerId: customer.id,
      },
    };
  }

  // --------------------------------------------------
  // DESTINATION ACCOUNT FILTER
  // --------------------------------------------------
  if (filters.destinationAccount) {
    where.destinationAccount = {
      is: {
        accountNumber: filters.destinationAccount,
        customerId: customer.id,
      },
    };
  }

  // --------------------------------------------------
  // QUERY TRANSFER TRANSACTIONS
  // --------------------------------------------------
  const [dataCount, transactions] =
    await prisma.$transaction([
      prisma.fundTransaction.count({
        where,
      }),

      prisma.fundTransaction.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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

          createdAt: true,
          completedAt: true,

          sourceAccount: {
            select: {
              accountNumber: true,
              currency: true,
            },
          },

          destinationAccount: {
            select: {
              accountNumber: true,
              currency: true,
            },
          },
        },
      }),
    ]);

  // --------------------------------------------------
  // FORMAT TRANSFER REPORT ROWS
  // --------------------------------------------------
  const pageData = transactions.map(
    (transaction) => ({
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      status: transaction.status,

      sourceAccount:
        transaction.sourceAccount?.accountNumber ??
        null,

      destinationAccount:
        transaction.destinationAccount?.accountNumber ??
        null,

      amount: transaction.amount.toString(),
      currency: transaction.currency,

      convertedAmount:
        transaction.convertedAmount?.toString() ??
        null,

      convertedCurrency:
        transaction.convertedCurrency,

      exchangeRate:
        transaction.exchangeRate?.toString() ??
        null,

      exchangeRateSource:
        transaction.exchangeRateSource,

      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    })
  );

  // --------------------------------------------------
  // PAGINATED RESPONSE
  // --------------------------------------------------
  return {
    page,
    pageSize,
    dataCount,
    pageCount: Math.ceil(dataCount / pageSize),
    pageData,
  };
}
