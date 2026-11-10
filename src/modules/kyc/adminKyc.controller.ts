
import {
  claimKycTransition,
  KycLifecycleConflictError,
} from "./kycLifecycle.js";

import type { Request, Response } from "express";

import prisma from "../../db/db.config.js";

import { generateTradingAccountNumber } from "../../utils/tradingAccount.js";

// ======================================================
// ADMIN REVIEW KYC
// ======================================================

export const reviewKyc = async (
  req: Request,
  res: Response,
) => {
  try {
    const { customerId } = req.params;

    // --------------------------------------------------
    // VALIDATE CUSTOMER UUID
    // --------------------------------------------------

    if (
      typeof customerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        customerId,
      )
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "A valid customer UUID is required",
        data: null,
      });
    }

    const { decision } = req.body as {
      decision: "APPROVED" | "REJECTED";
    };

    // Validate decision explicitly.
    if (
      decision !== "APPROVED" &&
      decision !== "REJECTED"
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Decision must be APPROVED or REJECTED",
        data: null,
      });
    }

    // --------------------------------------------------
    // LOAD CUSTOMER
    // --------------------------------------------------

    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
      include: {
        kycProfile: true,
        tradingAccounts: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    if (!customer.kycProfile) {
      return res.status(400).json({
        statusCode: 400,
        message: "KYC profile not found",
        data: null,
      });
    }

    // Customer.status is the KYC lifecycle source
    // of truth.
    if (customer.status !== "COMPLETED") {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Only completed KYC applications can be reviewed",
        data: null,
      });
    }

    // ==================================================
    // REJECT KYC
    // ==================================================

    if (decision === "REJECTED") {
      // Change KYC status and create the email event
      // atomically. A failed transaction rolls back both.
      const updatedCustomer = await prisma.$transaction(
        async (tx) => {
          await claimKycTransition(
            tx,
            customer.id,
            "COMPLETED",
            "REJECTED"
          );

          await tx.emailOutbox.create({
            data: {
              eventKey: `kyc:rejected:${customer.id}`,
              type: "kyc-rejected-email",
              userId: customer.userId,
              status: "PENDING",
            },
          });

          return {
            status: "REJECTED",
          };
        }
      );

      // Existing Notification Center behavior.
      // Best effort after successful KYC commit.
      try {
        await prisma.notification.upsert({
          where: {
            eventKey: `kyc:rejected:${customer.id}`,
          },
          create: {
            userId: customer.userId,
            type: "WARNING",
            title: "KYC Application Rejected",
            message:
              "Your KYC application has been rejected. Please contact support for assistance.",
            eventKey: `kyc:rejected:${customer.id}`,
          },
          update: {},
        });
      } catch (notificationError) {
        console.error(
          "[KYC] Failed to create rejected notification:",
          notificationError
        );
      }

      return res.status(200).json({
        statusCode: 200,
        message: "KYC rejected successfully",
        data: {
          status: updatedCustomer.status,
        },
      });
    }

    // ==================================================
    // APPROVE KYC
    // ==================================================
    //
    // KYC approval, creation of Trading Account #1,
    // and the EmailOutbox event must succeed together.
    // ==================================================

    const result = await prisma.$transaction(
      async (tx) => {
        await claimKycTransition(
          tx,
          customer.id,
          "COMPLETED",
          "APPROVED"
        );

        // A customer reaching first approval should
        // not already have a trading account.
        const existingAccountCount =
          await tx.tradingAccount.count({
            where: {
              customerId: customer.id,
            },
          });

        if (existingAccountCount > 0) {
          throw new Error(
            "Customer already has a trading account before KYC approval"
          );
        }

        // Generate a unique customer-facing account
        // number. Database UNIQUE constraint remains
        // the final protection.
        let accountNumber: string | null = null;

        for (let attempt = 0; attempt < 5; attempt += 1) {
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
            "Unable to generate unique trading account number"
          );
        }

        // ------------------------------------------
        // CREATE TRADING ACCOUNT #1
        // ------------------------------------------

        const tradingAccount =
          await tx.tradingAccount.create({
            data: {
              customerId: customer.id,
              accountNumber,
              platform: "MT5",
              currency: "USD",
              balance: 0,
              status: "ACTIVE",
            },
          });

        // ------------------------------------------
        // CREATE KYC APPROVAL EMAIL OUTBOX EVENT
        // ------------------------------------------

        await tx.emailOutbox.create({
          data: {
            eventKey: `kyc:approved:${customer.id}`,
            type: "kyc-approved-email",
            userId: customer.userId,
            status: "PENDING",
          },
        });

        const updatedCustomer = {
          status: "APPROVED",
        };

        return {
          customer: updatedCustomer,
          tradingAccount,
        };
      }
    );

    // ==================================================
    // APPROVAL NOTIFICATION
    // ==================================================
    //
    // Retain existing in-app Notification Center
    // behavior. Email delivery is now asynchronous.
    // ==================================================

    try {
      await prisma.notification.upsert({
        where: {
          eventKey: `kyc:approved:${customer.id}`,
        },
        create: {
          userId: customer.userId,
          type: "SUCCESS",
          title: "KYC Application Approved",
          message:
            "Your KYC application has been approved and your trading account is ready.",
          eventKey: `kyc:approved:${customer.id}`,
        },
        update: {},
      });
    } catch (notificationError) {
      console.error(
        "[KYC] Failed to create approved notification:",
        notificationError
      );
    }

    // ==================================================
    // SUCCESS RESPONSE
    // ==================================================

    return res.status(200).json({
      statusCode: 200,
      message: "KYC approved successfully",
      data: {
        status: result.customer.status,
        tradingAccount: {
          id: result.tradingAccount.id,
          accountNumber:
            result.tradingAccount.accountNumber,
          platform:
            result.tradingAccount.platform,
          currency:
            result.tradingAccount.currency,
          balance:
            result.tradingAccount.balance,
          status:
            result.tradingAccount.status,
        },
      },
    });
  } catch (error) {
    if (error instanceof KycLifecycleConflictError) {
      return res.status(409).json({
        statusCode: 409,
        message: error.message,
        data: null,
      });
    }

    console.error("Review KYC error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Failed to review KYC",
      data: null,
    });
  }
};
