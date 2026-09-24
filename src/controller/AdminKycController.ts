import type { Request, Response } from "express";

import prisma from "../db/db.config.js";
import { sendEmail } from "../services/emailService.js";
import { renderEmailTemplate } from "../utils/emailTemplate.js";
import { generateTradingAccountNumber } from "../utils/tradingAccount.js";

export const reviewKyc = async (
  req: Request,
  res: Response,
) => {
  try {
    const { customerId } = req.params;

    /*
     * Validate customer UUID.
     */
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

    /*
     * Load customer and KYC information.
     */
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

    /*
     * Admin can make the final decision only after
     * the customer has completed the KYC process.
     */
    if (customer.kycProfile.status !== "COMPLETED") {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Only completed KYC applications can be reviewed",
        data: null,
      });
    }

    /*
     * ==================================================
     * REJECT
     * ==================================================
     */
  if (decision === "REJECTED") {
  /*
   * Update KYC first.
   *
   * No trading account is created for rejected KYC.
   */
  const kycProfile =
    await prisma.kycProfile.update({
      where: {
        customerId: customer.id,
      },
      data: {
        status: "REJECTED",
      },
    });

  /*
   * Send rejection email after the database
   * update has completed successfully.
   *
   * Email failure must not change the KYC decision.
   */
  try {
    const html = await renderEmailTemplate(
      "notification/kyc-rejected",
      {
        name: customer.customerFirstName,

        supportUrl:
          process.env.SUPPORT_URL ??
          "http://localhost:3001/support",
      },
    );

    await sendEmail(
      customer.email,
      "Update on your TradePro KYC application",
      html,
    );

    console.log(
      `[KYC] Rejection email sent for customer ${customer.id}`,
    );
  } catch (emailError) {
    console.error(
      `[KYC] Failed to send rejection email for customer ${customer.id}:`,
      emailError,
    );
  }

  return res.status(200).json({
    statusCode: 200,
    message: "KYC rejected successfully",
    data: {
      status: kycProfile.status,
    },
  });
}

    /*
     * ==================================================
     * APPROVE
     * ==================================================
     *
     * KYC approval and creation of the customer's
     * first trading account must happen together.
     */
    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * A customer reaching final approval should not
         * already have a trading account.
         */
        const existingAccountCount =
          await tx.tradingAccount.count({
            where: {
              customerId: customer.id,
            },
          });

        if (existingAccountCount > 0) {
          throw new Error(
            "Customer already has a trading account before KYC approval",
          );
        }

        /*
         * Generate a unique customer-facing account number.
         *
         * The database UNIQUE constraint remains the final
         * protection against duplicate account numbers.
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
            "Unable to generate unique trading account number",
          );
        }

        /*
         * Create Account #1.
         *
         * MT5 is display-only for now.
         */
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

        /*
         * Final KYC approval.
         */
        const kycProfile =
          await tx.kycProfile.update({
            where: {
              customerId: customer.id,
            },
            data: {
              status: "APPROVED",
            },
          });

        return {
          kycProfile,
          tradingAccount,
        };
      },
    );

    /*
     * ==================================================
     * APPROVAL EMAIL
     * ==================================================
     *
     * IMPORTANT:
     * We are now OUTSIDE the Prisma transaction.
     *
     * If SendGrid fails, the customer's KYC remains
     * APPROVED and Account #1 remains created.
     */
    try {
      const html = await renderEmailTemplate(
        "notification/kyc-approved",
        {
          name: customer.customerFirstName,

          accountNumber:
            result.tradingAccount.accountNumber,

          platform:
            result.tradingAccount.platform,

          currency:
            result.tradingAccount.currency,
        },
      );

      await sendEmail(
        customer.email,
        "Your TradePro account has been approved",
        html,
      );

      console.log(
        `[KYC] Approval email sent for customer ${customer.id}`,
      );
    } catch (emailError) {
      console.error(
        `[KYC] Failed to send approval email for customer ${customer.id}:`,
        emailError,
      );
    }

    /*
     * ==================================================
     * SUCCESS RESPONSE
     * ==================================================
     */
    return res.status(200).json({
      statusCode: 200,
      message: "KYC approved successfully",

      data: {
        status: result.kycProfile.status,

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
    console.error(
      "Review KYC error:",
      error,
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Failed to review KYC",
      data: null,
    });
  }
};