import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { Prisma } from "../../generated/prisma/client.js";

import {
  createDeposit,
  getDepositStatus,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  processWithdrawal,
  createTransfer,
  getTransactionHistory
} from "./funds.service.js";

import {
  getExchangeRate,
} from "./fx.service.js";
import { getIdempotencyKey } from "./utils/idempotencyKey.js";

// ======================================================
// CREATE DEPOSIT
// ======================================================

export const createDepositController = async (
  req: Request,
  res: Response
) => {
  try {
    // --------------------------------
    // AUTHENTICATED USER
    // --------------------------------

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    // --------------------------------
    // IDEMPOTENCY KEY
    // --------------------------------

    const idempotencyKey =
      getIdempotencyKey(req);

    // --------------------------------
    // REQUEST BODY
    // --------------------------------

    const {
      accountNumber,
      amount,
      currency,
      provider,
    } = req.body ?? {};

    // --------------------------------
    // CREATE DEPOSIT
    // --------------------------------

    const result = await createDeposit({
      userId,
      accountNumber,
      amount,
      currency,
      provider,
      idempotencyKey,
    });

    // --------------------------------
    // RESPONSE
    // --------------------------------

    return res.status(201).json({
      statusCode: 201,

      message:
        result.idempotentReplay
          ? "Deposit request already submitted"
          : "Deposit initiated successfully",

      data: result,
    });
  } catch (error) {
    console.error(
      "Create deposit error:",
      error
    );

    // --------------------------------
    // IDEMPOTENCY
    // --------------------------------

    if (error instanceof Error) {
      switch (error.message) {
        case "IDEMPOTENCY_KEY_REQUIRED":
          return res.status(400).json({
            statusCode: 400,
            message:
              "Idempotency-Key header is required",
            data: null,
          });

        case "INVALID_IDEMPOTENCY_KEY":
          return res.status(400).json({
            statusCode: 400,
            message:
              "Invalid Idempotency-Key header",
            data: null,
          });

        case "IDEMPOTENCY_KEY_CONFLICT":
          return res.status(409).json({
            statusCode: 409,
            message:
              "This Idempotency-Key has already been used for a different request",
            data: null,
          });

        case "IDEMPOTENCY_REQUEST_PROCESSING":
          return res.status(409).json({
            statusCode: 409,
            message:
              "A request with this Idempotency-Key is already being processed",
            data: null,
          });

        case "IDEMPOTENCY_TRANSACTION_NOT_FOUND":
          return res.status(409).json({
            statusCode: 409,
            message:
              "Unable to safely replay this deposit request",
            data: null,
          });

        case "IDEMPOTENCY_PAYMENT_ATTEMPT_NOT_FOUND":
          return res.status(409).json({
            statusCode: 409,
            message:
              "Payment attempt for this deposit could not be found",
            data: null,
          });

        case "IDEMPOTENCY_REQUEST_INVALID_STATE":
          return res.status(409).json({
            statusCode: 409,
            message:
              "Unable to safely process this idempotent request",
            data: null,
          });

        // --------------------------------
        // CUSTOMER
        // --------------------------------

        case "CUSTOMER_NOT_FOUND":
          return res.status(404).json({
            statusCode: 404,
            message: "Customer not found",
            data: null,
          });

        case "CUSTOMER_INACTIVE":
          return res.status(403).json({
            statusCode: 403,
            message:
              "Customer account is inactive",
            data: null,
          });

        // --------------------------------
        // TRADING ACCOUNT
        // --------------------------------

        case "TRADING_ACCOUNT_NOT_FOUND":
          return res.status(404).json({
            statusCode: 404,
            message:
              "Trading account not found",
            data: null,
          });

        case "TRADING_ACCOUNT_NOT_ACTIVE":
          return res.status(400).json({
            statusCode: 400,
            message:
              "Trading account is not active",
            data: null,
          });

        // --------------------------------
        // AMOUNT
        // --------------------------------

        case "INVALID_DEPOSIT_AMOUNT":
          return res.status(400).json({
            statusCode: 400,
            message:
              "Invalid deposit amount",
            data: null,
          });

        case "INVALID_CONVERTED_AMOUNT":
          return res.status(400).json({
            statusCode: 400,
            message:
              "Invalid converted deposit amount",
            data: null,
          });
      }
    }

    // --------------------------------
    // UNKNOWN / PSP ERROR
    // --------------------------------

    return res.status(500).json({
      statusCode: 500,
      message:
        "Unable to initiate deposit",
      data: null,
    });
  }
};

// ======================================================
// GET DEPOSIT STATUS
// ======================================================

export const getDepositStatusController =
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          statusCode: 401,
          message:
            "Authentication required",
          data: null,
        });
      }

      const { sessionId } = req.body;

      const result =
        await getDepositStatus(
          userId,
          sessionId
        );

      return res.status(200).json({
        statusCode: 200,

        message:
          result.status === "COMPLETED"
            ? "Deposit successful"
            : "Deposit status retrieved",

        data: result,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "DEPOSIT_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message: "Deposit not found",
          data: null,
        });
      }

      console.error(
        "Get deposit status error:",
        error
      );

      return res.status(500).json({
        statusCode: 500,
        message:
          "Unable to retrieve deposit status",
        data: null,
      });
    }
  };


// ======================================================
// GET EXCHANGE RATE
// ======================================================

export const getExchangeRateController =
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        fromCurrency,
        toCurrency,
        amount,
      } = req.body ?? {};

      const quote =
        await getExchangeRate(
          fromCurrency,
          toCurrency
        );

      const requestedAmount =
        new Prisma.Decimal(
          amount.toString()
        );

      const convertedAmount =
        requestedAmount
          .mul(quote.rate)
          .toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP
          );

      return res.status(200).json({
        statusCode: 200,

        message:
          "Exchange rate retrieved successfully",

        data: {
          fromCurrency:
            quote.fromCurrency,

          toCurrency:
            quote.toCurrency,

          amount:
            requestedAmount.toString(),

          exchangeRate:
            quote.rate.toString(),

          convertedAmount:
            convertedAmount.toString(),

          source:
            quote.source,

          quotedAt:
            quote.quotedAt,

          providerDate:
            quote.providerDate,
        },
      });
    } catch (error) {
      console.error(
        "Get exchange rate error:",
        error
      );

      return res.status(503).json({
        statusCode: 503,
        message:
          "Unable to retrieve exchange rate",
        data: null,
      });
    }
  };


// ======================================================
// CREATE WITHDRAWAL
// CUSTOMER ONLY INITIATES THE REQUEST
// ======================================================

export const createWithdrawalController =
  async (
    req: Request,
    res: Response
  ) => {
    try {
      // --------------------------------
      // AUTHENTICATED USER
      // --------------------------------

      if (!req.user?.id) {
        return res.status(401).json({
          statusCode: 401,
          message:
            "Authentication required",
          data: null,
        });
      }

      const userId =
        req.user.id;

      // --------------------------------
      // IDEMPOTENCY KEY
      // --------------------------------

      const idempotencyKey =
        getIdempotencyKey(req);

      // --------------------------------
      // REQUEST BODY
      //
      // Customer does NOT choose the
      // payout provider.
      // --------------------------------

      const {
        accountNumber,
        amount,
        payoutCurrency,
      } = req.body;

      // --------------------------------
      // CREATE WITHDRAWAL
      // --------------------------------

      const result =
        await createWithdrawal({
          userId,
          accountNumber,
          amount,
          payoutCurrency,
          idempotencyKey,
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(201).json({
        statusCode: 201,

        message:
          result.idempotentReplay
            ? "Withdrawal request already submitted"
            : "Withdrawal request submitted successfully",

        data: result,
      });
    } catch (error) {
      // --------------------------------
      // IDEMPOTENCY
      // --------------------------------

      if (error instanceof Error) {
        switch (error.message) {
          case "IDEMPOTENCY_KEY_REQUIRED":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Idempotency-Key header is required",
              data: null,
            });

          case "INVALID_IDEMPOTENCY_KEY":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Invalid Idempotency-Key header",
              data: null,
            });

          case "IDEMPOTENCY_KEY_CONFLICT":
            return res.status(409).json({
              statusCode: 409,
              message:
                "This Idempotency-Key has already been used for a different request",
              data: null,
            });

          case "IDEMPOTENCY_REQUEST_PROCESSING":
            return res.status(409).json({
              statusCode: 409,
              message:
                "A request with this Idempotency-Key is already being processed",
              data: null,
            });

          case "IDEMPOTENCY_TRANSACTION_NOT_FOUND":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Unable to safely replay this withdrawal request",
              data: null,
            });

          case "IDEMPOTENCY_REQUEST_INVALID_STATE":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Unable to safely process this idempotent request",
              data: null,
            });
        }
      }

      // --------------------------------
      // PASSWORD CHANGE COOLDOWN
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_PASSWORD_COOLDOWN"
      ) {
        const withdrawalAllowedAt =
          "withdrawalAllowedAt" in error
            ? (
                error as Error & {
                  withdrawalAllowedAt: Date;
                }
              ).withdrawalAllowedAt
            : null;

        return res.status(403).json({
          statusCode: 403,

          message:
            "Withdrawals are disabled for 24 hours after a password change.",

          data: {
            withdrawalAllowedAt,
          },
        });
      }

      // --------------------------------
      // CUSTOMER
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "CUSTOMER_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message:
            "Customer not found",
          data: null,
        });
      }

      if (
        error instanceof Error &&
        error.message ===
          "CUSTOMER_INACTIVE"
      ) {
        return res.status(403).json({
          statusCode: 403,
          message:
            "Customer account is inactive",
          data: null,
        });
      }

      // --------------------------------
      // TRADING ACCOUNT
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "TRADING_ACCOUNT_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message:
            "Trading account not found",
          data: null,
        });
      }

      if (
        error instanceof Error &&
        error.message ===
          "TRADING_ACCOUNT_NOT_ACTIVE"
      ) {
        return res.status(403).json({
          statusCode: 403,
          message:
            "Trading account is not active",
          data: null,
        });
      }

      // --------------------------------
      // INVALID WITHDRAWAL AMOUNT
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "INVALID_WITHDRAWAL_AMOUNT"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "Invalid withdrawal amount",
          data: null,
        });
      }

      // --------------------------------
      // BALANCE
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "INSUFFICIENT_AVAILABLE_BALANCE"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "Insufficient available balance",
          data: null,
        });
      }

      // --------------------------------
      // UNKNOWN ERROR
      // --------------------------------

      throw error;
    }
  };


// ======================================================
// ADMIN APPROVE WITHDRAWAL
//
// ONLY required for withdrawals > $100 USD equivalent.
// Approval does NOT create a payout.
// ======================================================

export const approveWithdrawalController =
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const adminUserId =
        req.user?.id;

      if (!adminUserId) {
        return res.status(401).json({
          statusCode: 401,
          message: "Unauthorized",
          data: null,
        });
      }

      // --------------------------------
      // TRANSACTION ID
      // --------------------------------

      const transactionIdParam =
        req.params.transactionId;

      if (
        typeof transactionIdParam !==
        "string"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "Invalid transaction ID",
          data: null,
        });
      }

      const transactionId =
        transactionIdParam;

      // --------------------------------
      // REMARKS
      // --------------------------------

      const { remarks } =
        req.body;

      // --------------------------------
      // APPROVE
      // --------------------------------

      const result =
        await approveWithdrawal(
          adminUserId,
          transactionId,
          remarks
        );

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(200).json({
        statusCode: 200,

        message:
          "Withdrawal approved successfully",

        data: {
          transactionId:
            result.id,

          reference:
            result.reference,

          status:
            result.status,

          approval: {
            status:
              result
                .withdrawalApprovalStatus,

            approvedById:
              result.approvedById,

            approvedAt:
              result.approvedAt,

            remarks:
              result.approvalRemarks,
          },

          /*
           * No payout is created during
           * approval.
           *
           * Admin will process it separately.
           */
          payout: null,
        },
      });
    } catch (error) {
      next(error);
    }
  };


// ======================================================
// ADMIN REJECT WITHDRAWAL
// ======================================================

export const rejectWithdrawalController =
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const adminUserId =
        req.user?.id;

      if (!adminUserId) {
        return res.status(401).json({
          statusCode: 401,
          message: "Unauthorized",
          data: null,
        });
      }

      // --------------------------------
      // TRANSACTION ID
      // --------------------------------

      const transactionIdParam =
        req.params.transactionId;

      if (
        typeof transactionIdParam !==
        "string"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "Invalid transaction ID",
          data: null,
        });
      }

      const transactionId =
        transactionIdParam;

      // --------------------------------
      // REMARKS
      // --------------------------------

      const { remarks } =
        req.body;

      // --------------------------------
      // REJECT
      // --------------------------------

      const result =
        await rejectWithdrawal(
          adminUserId,
          transactionId,
          remarks
        );

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(200).json({
        statusCode: 200,

        message:
          "Withdrawal rejected successfully",

        data: {
          transactionId:
            result.id,

          reference:
            result.reference,

          status:
            result.status,

          approval: {
            status:
              result
                .withdrawalApprovalStatus,

            rejectedById:
              result.rejectedById,

            rejectedAt:
              result.rejectedAt,

            remarks:
              result.approvalRemarks,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ======================================================
// ADMIN PROCESS WITHDRAWAL
//
// <= $100:
//   Can be processed directly.
//
// > $100:
//   Must be approved first.
//
// This creates the PayoutAttempt.
// It does NOT complete the withdrawal.
// ======================================================

export const processWithdrawalController =
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // --------------------------------
      // ADMIN USER
      // --------------------------------

      const adminUserId =
        req.user?.id;

      if (!adminUserId) {
        return res.status(401).json({
          statusCode: 401,
          message: "Unauthorized",
          data: null,
        });
      }

      // --------------------------------
      // TRANSACTION ID
      // --------------------------------

      const transactionIdParam =
        req.params.transactionId;

      if (
        typeof transactionIdParam !==
        "string"
      ) {
        return res.status(400).json({
          statusCode: 400,
          message:
            "Invalid transaction ID",
          data: null,
        });
      }

      const transactionId =
        transactionIdParam;

      // --------------------------------
      // PROVIDER
      // --------------------------------

      const { provider } =
        req.body;

      // --------------------------------
      // PROCESS WITHDRAWAL
      // --------------------------------

      const result =
        await processWithdrawal({
          adminUserId,
          transactionId,
          provider,
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(200).json({
        statusCode: 200,

        message:
          "Withdrawal payout initiated successfully",

        data: {
          transactionId:
            result.withdrawal.id,

          reference:
            result.withdrawal.reference,

          status:
            result.withdrawal.status,

          approvalStatus:
            result.withdrawal
              .approvalStatus,

          payout: {
            attemptId:
              result.payoutAttempt.id,

            provider:
              result.payoutAttempt.provider,

            status:
              result.payoutAttempt.status,

            amount:
              result.payoutAttempt.amount,

            currency:
              result.payoutAttempt.currency,
          },

          processedBy:
            result.processedBy,
        },
      });
    } catch (error) {
      // --------------------------------
      // APPROVAL REQUIRED
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_APPROVAL_REQUIRED"
      ) {
        return res.status(409).json({
          statusCode: 409,

          message:
            "This withdrawal requires admin approval before it can be processed.",

          data: null,
        });
      }

      // --------------------------------
      // WITHDRAWAL REJECTED
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_REJECTED"
      ) {
        return res.status(409).json({
          statusCode: 409,

          message:
            "This withdrawal has been rejected and cannot be processed.",

          data: null,
        });
      }

      // --------------------------------
      // WITHDRAWAL NOT FOUND
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,

          message:
            "Withdrawal not found.",

          data: null,
        });
      }

      // --------------------------------
      // NOT PENDING
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_NOT_PENDING"
      ) {
        return res.status(409).json({
          statusCode: 409,

          message:
            "This withdrawal is no longer pending.",

          data: null,
        });
      }

      // --------------------------------
      // PAYOUT ALREADY CREATED
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "PAYOUT_ATTEMPT_ALREADY_EXISTS"
      ) {
        return res.status(409).json({
          statusCode: 409,

          message:
            "A payout attempt already exists for this withdrawal.",

          data: null,
        });
      }

      // --------------------------------
      // PAYOUT DATA MISSING
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "WITHDRAWAL_PAYOUT_DATA_MISSING"
      ) {
        return res.status(409).json({
          statusCode: 409,

          message:
            "Withdrawal payout information is incomplete.",

          data: null,
        });
      }

      // --------------------------------
      // UNKNOWN ERROR
      // --------------------------------

      return next(error);
    }
  };

  // ======================================================
// CREATE TRANSFER CONTROLLER
// ======================================================

export const createTransferController =
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // --------------------------------
      // AUTHENTICATED USER
      // --------------------------------

      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          statusCode: 401,
          message:
            "Authentication required",
          data: null,
        });
      }

      // --------------------------------
      // IDEMPOTENCY KEY
      // --------------------------------

      const idempotencyKey =
        getIdempotencyKey(req);

      // --------------------------------
      // REQUEST BODY
      // --------------------------------

      const {
        sourceAccountNumber,
        destinationAccountNumber,
        amount,
      } = req.body;

      // --------------------------------
      // CREATE TRANSFER
      // --------------------------------

      const result =
        await createTransfer({
          userId,
          sourceAccountNumber,
          destinationAccountNumber,
          amount,
          idempotencyKey,
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(201).json({
        statusCode: 201,

        message:
          result.idempotentReplay
            ? "Transfer already processed"
            : "Transfer completed successfully",

        data: result,
      });
    } catch (error) {
      // --------------------------------
      // KNOWN TRANSFER ERRORS
      // --------------------------------

      if (error instanceof Error) {
        switch (error.message) {
          // --------------------------------
          // IDEMPOTENCY KEY REQUIRED
          // --------------------------------

          case "IDEMPOTENCY_KEY_REQUIRED":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Idempotency-Key header is required",
              data: null,
            });

          // --------------------------------
          // INVALID IDEMPOTENCY KEY
          // --------------------------------

          case "INVALID_IDEMPOTENCY_KEY":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Invalid Idempotency-Key header",
              data: null,
            });

          // --------------------------------
          // IDEMPOTENCY KEY CONFLICT
          // --------------------------------

          case "IDEMPOTENCY_KEY_CONFLICT":
            return res.status(409).json({
              statusCode: 409,
              message:
                "This Idempotency-Key has already been used for a different request",
              data: null,
            });

          // --------------------------------
          // REQUEST STILL PROCESSING
          // --------------------------------

          case "IDEMPOTENCY_REQUEST_PROCESSING":
            return res.status(409).json({
              statusCode: 409,
              message:
                "A request with this Idempotency-Key is already being processed",
              data: null,
            });

          // --------------------------------
          // IDEMPOTENCY TRANSACTION MISSING
          // --------------------------------

          case "IDEMPOTENCY_TRANSACTION_NOT_FOUND":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Unable to safely replay this transfer request",
              data: null,
            });

          // --------------------------------
          // INVALID IDEMPOTENCY STATE
          // --------------------------------

          case "IDEMPOTENCY_REQUEST_INVALID_STATE":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Unable to safely process this idempotent request",
              data: null,
            });

          // --------------------------------
          // INVALID TRANSFER TRANSACTION
          // --------------------------------

          case "INVALID_TRANSFER_TRANSACTION":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Transfer transaction is in an invalid state",
              data: null,
            });

          // --------------------------------
          // CUSTOMER NOT FOUND
          // --------------------------------

          case "CUSTOMER_NOT_FOUND":
            return res.status(404).json({
              statusCode: 404,
              message:
                "Customer not found",
              data: null,
            });

          // --------------------------------
          // CUSTOMER INACTIVE
          // --------------------------------

          case "CUSTOMER_INACTIVE":
            return res.status(403).json({
              statusCode: 403,
              message:
                "Customer account is inactive",
              data: null,
            });

          // --------------------------------
          // SOURCE ACCOUNT NOT FOUND
          // --------------------------------

          case "SOURCE_ACCOUNT_NOT_FOUND":
            return res.status(404).json({
              statusCode: 404,
              message:
                "Source trading account not found",
              data: null,
            });

          // --------------------------------
          // DESTINATION ACCOUNT NOT FOUND
          // --------------------------------

          case "DESTINATION_ACCOUNT_NOT_FOUND":
            return res.status(404).json({
              statusCode: 404,
              message:
                "Destination trading account not found",
              data: null,
            });

          // --------------------------------
          // SOURCE ACCOUNT NOT ACTIVE
          // --------------------------------

          case "SOURCE_ACCOUNT_NOT_ACTIVE":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Source trading account is not active",
              data: null,
            });

          // --------------------------------
          // DESTINATION ACCOUNT NOT ACTIVE
          // --------------------------------

          case "DESTINATION_ACCOUNT_NOT_ACTIVE":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Destination trading account is not active",
              data: null,
            });

          // --------------------------------
          // SAME SOURCE + DESTINATION
          // --------------------------------

          case "SAME_TRANSFER_ACCOUNT":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Source and destination accounts cannot be the same",
              data: null,
            });

          // --------------------------------
          // INVALID AMOUNT
          // --------------------------------

          case "INVALID_TRANSFER_AMOUNT":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Invalid transfer amount",
              data: null,
            });

          // --------------------------------
          // INSUFFICIENT BALANCE
          // --------------------------------

          case "INSUFFICIENT_AVAILABLE_BALANCE":
            return res.status(409).json({
              statusCode: 409,
              message:
                "Insufficient available balance",
              data: null,
            });

          // --------------------------------
          // INVALID CONVERTED AMOUNT
          // --------------------------------

          case "INVALID_CONVERTED_AMOUNT":
            return res.status(400).json({
              statusCode: 400,
              message:
                "Invalid converted transfer amount",
              data: null,
            });
        }
      }

      // --------------------------------
      // UNKNOWN ERROR
      // --------------------------------

      return next(error);
    }
  };

  // ======================================================
// GET TRANSACTION HISTORY CONTROLLER
// ======================================================

export const getTransactionHistoryController =
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // --------------------------------
      // AUTHENTICATED USER
      // --------------------------------

      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          statusCode: 401,
          message:
            "Authentication required",
          data: null,
        });
      }

      // --------------------------------
      // REQUEST BODY
      // --------------------------------

      const {
        page = 1,
        pageSize = 10,
        filters = {},
      } = req.body;

      // --------------------------------
      // GET TRANSACTIONS
      // --------------------------------

      const result =
        await getTransactionHistory({
          userId,
          page,
          pageSize,
          filters,
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res.status(200).json({
        statusCode: 200,

        message:
          "Transactions retrieved successfully",

        data: result,
      });
    } catch (error) {
      // --------------------------------
      // CUSTOMER NOT FOUND
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "CUSTOMER_NOT_FOUND"
      ) {
        return res.status(404).json({
          statusCode: 404,
          message:
            "Customer not found",
          data: null,
        });
      }

      // --------------------------------
      // CUSTOMER INACTIVE
      // --------------------------------

      if (
        error instanceof Error &&
        error.message ===
          "CUSTOMER_INACTIVE"
      ) {
        return res.status(403).json({
          statusCode: 403,
          message:
            "Customer account is inactive",
          data: null,
        });
      }

      // --------------------------------
      // UNKNOWN ERROR
      // --------------------------------

      return next(error);
    }
  };
