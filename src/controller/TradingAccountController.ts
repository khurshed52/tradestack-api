import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client.js";

import prisma from "../db/db.config.js";
import { generateTradingAccountNumber } from "../utils/tradingAccount.js";

export const createTradingAccount = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    const { platform, currency } = req.body as {
      platform: "MT4" | "MT5";
      currency: "USD";
    };

    /*
     * Find the customer belonging to the
     * authenticated user.
     *
     * Never accept customerId from the request body.
     */
    const customer = await prisma.customer.findUnique({
      where: {
        userId,
      },
      include: {
        kycProfile: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    /*
     * Only approved customers may create
     * additional trading accounts.
     */
    if (customer.kycProfile?.status !== "APPROVED") {
      return res.status(403).json({
        statusCode: 403,
        message:
          "KYC approval is required to create a trading account",
        data: null,
      });
    }

    /*
     * Create the account inside a transaction so
     * the account-count check and account creation
     * happen together.
     */
    const tradingAccount = await prisma.$transaction(
      async (tx) => {
        const accountCount =
          await tx.tradingAccount.count({
            where: {
              customerId: customer.id,
            },
          });

        /*
         * Account #1 was created automatically when
         * KYC was approved.
         *
         * Customers may have a maximum of 3 accounts.
         */
        if (accountCount >= 3) {
          throw new Error(
            "TRADING_ACCOUNT_LIMIT_REACHED",
          );
        }

        /*
         * Generate a unique account number.
         */
        let accountNumber: string | null = null;

        for (
          let attempt = 0;
          attempt < 5;
          attempt += 1
        ) {
          const candidate =
            generateTradingAccountNumber();

          const existing =
            await tx.tradingAccount.findUnique({
              where: {
                accountNumber: candidate,
              },
              select: {
                id: true,
              },
            });

          if (!existing) {
            accountNumber = candidate;
            break;
          }
        }

        if (!accountNumber) {
          throw new Error(
            "ACCOUNT_NUMBER_GENERATION_FAILED",
          );
        }

        return tx.tradingAccount.create({
          data: {
            customerId: customer.id,
            accountNumber,
            platform,
            currency,
            balance: 0,
            status: "ACTIVE",
          },
        });
      },
    );

    return res.status(201).json({
      statusCode: 201,
      message: "Trading account created successfully",
      data: {
        tradingAccount: {
          id: tradingAccount.id,
          accountNumber:
            tradingAccount.accountNumber,
          platform: tradingAccount.platform,
          currency: tradingAccount.currency,
          balance: tradingAccount.balance,
          status: tradingAccount.status,
        },
      },
    });
  } catch (error) {
    /*
     * Customer already has three accounts.
     */
    if (
      error instanceof Error &&
      error.message ===
        "TRADING_ACCOUNT_LIMIT_REACHED"
    ) {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Maximum of 3 trading accounts allowed",
        data: null,
      });
    }

    console.error(
      "Create trading account error:",
      error,
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Failed to create trading account",
      data: null,
    });
  }
};

export const getTradingAccounts = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    const body = req.body ?? {};

    const {
      page = 1,
      pageSize = 10,
      filters = {},
    } = body;

    /*
     * Validate pagination.
     */
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "page must be a positive integer and pageSize must be between 1 and 100",
        data: null,
      });
    }

    /*
     * Validate filters.
     */
    if (
      !filters ||
      typeof filters !== "object" ||
      Array.isArray(filters)
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "filters must be an object",
        data: null,
      });
    }

    const allowedFilters = [
      "accountNumber",
      "platform",
      "currency",
      "status",
    ] as const;

    /*
     * Reject unsupported filters.
     */
    if (
      Object.keys(filters).some(
        (key) =>
          !allowedFilters.includes(
            key as (typeof allowedFilters)[number],
          ) ||
          typeof filters[key] !== "string",
      )
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Supported filters are accountNumber, platform, currency, and status",
        data: null,
      });
    }

    /*
     * Get customer from authenticated user.
     *
     * customerId never comes from the request.
     */
    const customer = await prisma.customer.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    /*
     * Always restrict results to the logged-in customer.
     */
    const where: Prisma.TradingAccountWhereInput = {
      customerId: customer.id,
    };

    /*
     * Account number can use partial search.
     */
    const accountNumber =
      filters.accountNumber?.trim();

    if (accountNumber) {
      where.accountNumber = {
        contains: accountNumber,
      };
    }

    /*
     * Exact enum/value filters.
     */
    const platform = filters.platform?.trim();

    if (platform) {
      if (
        platform !== "MT4" &&
        platform !== "MT5"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "platform must be MT4 or MT5",
          data: null,
        });
      }

      where.platform = platform;
    }

    const currency =
      filters.currency?.trim().toUpperCase();

    if (currency) {
      where.currency = currency;
    }

    const status = filters.status?.trim();

    if (status) {
      if (
        status !== "ACTIVE" &&
        status !== "SUSPENDED" &&
        status !== "CLOSED"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "status must be ACTIVE, SUSPENDED, or CLOSED",
          data: null,
        });
      }

      where.status = status;
    }

    /*
     * Fetch count + paginated accounts.
     */
    const [dataCount, pageData] =
      await prisma.$transaction(
        [
          prisma.tradingAccount.count({
            where,
          }),

          prisma.tradingAccount.findMany({
            where,

            skip: (page - 1) * pageSize,
            take: pageSize,

            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "asc",
              },
            ],

            select: {
              id: true,
              accountNumber: true,
              platform: true,
              currency: true,
              balance: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
        ],
        {
          isolationLevel: "RepeatableRead",
        },
      );

    return res.status(200).json({
      statusCode: 200,
      message: "Data fetched successfully",
      data: {
        page,
        pageSize,
        dataCount,
        pageCount: Math.ceil(
          dataCount / pageSize,
        ),
        pageData,
      },
    });
  } catch (error) {
    console.error(
      "Get trading accounts error:",
      error,
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};
