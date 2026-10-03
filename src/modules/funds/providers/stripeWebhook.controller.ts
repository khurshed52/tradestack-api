import type { Request, Response } from "express";
import type Stripe from "stripe";

import { stripe } from "../../../config/stripe.js";
import prisma from "../../../db/db.config.js";

// --------------------------------
// HELPERS
// --------------------------------

const decimalToMinorUnits = (
  value: { mul: (n: number) => { toDecimalPlaces: (n: number) => { toString: () => string } } }
): number => {
  return Number(
    value
      .mul(100)
      .toDecimalPlaces(0)
      .toString()
  );
};

// --------------------------------
// STRIPE FUNDS WEBHOOK
// --------------------------------

export const stripeFundsWebhook = async (
  req: Request,
  res: Response
) => {
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(503).json({
      statusCode: 503,
      message:
        "Stripe webhook signing secret is not configured",
      data: null,
    });
  }

  const signature =
    req.get("stripe-signature");

  /*
   * Stripe signature verification requires the
   * ORIGINAL raw request body.
   */
  if (
    !signature ||
    !Buffer.isBuffer(req.body)
  ) {
    return res.status(400).json({
      statusCode: 400,
      message:
        "Missing Stripe signature or raw request body",
      data: null,
    });
  }

  // --------------------------------
  // VERIFY STRIPE SIGNATURE
  // --------------------------------

  let event: Stripe.Event;

  try {
    event =
      stripe.webhooks.constructEvent(
        req.body,
        signature,
        secret
      );
  } catch {
    return res.status(400).json({
      statusCode: 400,
      message: "Invalid webhook signature",
      data: null,
    });
  }

  // Test environment only for now.
  if (event.livemode) {
    return res.status(400).json({
      statusCode: 400,
      message:
        "Live Stripe events are not accepted",
      data: null,
    });
  }

  // --------------------------------
  // SUPPORTED EVENTS
  // --------------------------------

  const supportedEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ];

  if (!supportedEvents.includes(event.type)) {
    return res.status(200).json({
      received: true,
    });
  }

  const session =
    event.data.object as Stripe.Checkout.Session;

  // --------------------------------
  // VERIFY OUR METADATA
  // --------------------------------

  const paymentAttemptId =
    session.metadata?.paymentAttemptId;

  const fundTransactionId =
    session.metadata?.fundTransactionId;

  const transactionType =
    session.metadata?.transactionType;

  /*
   * This webhook endpoint should ignore Stripe
   * sessions not created by the Funds module.
   */
  if (
    !paymentAttemptId ||
    !fundTransactionId ||
    transactionType !== "DEPOSIT"
  ) {
    return res.status(200).json({
      received: true,
    });
  }

  try {
    // --------------------------------
    // LOAD PAYMENT ATTEMPT
    // --------------------------------

    const paymentAttempt =
      await prisma.paymentAttempt.findUnique({
        where: {
          id: paymentAttemptId,
        },

        include: {
          fundTransaction: true,
        },
      });

    if (!paymentAttempt) {
      return res.status(500).json({
        statusCode: 500,
        message:
          "Payment attempt unavailable; retry later",
        data: null,
      });
    }

    const fundTransaction =
      paymentAttempt.fundTransaction;

    // --------------------------------
    // SECURITY / CONSISTENCY CHECKS
    // --------------------------------

    if (
      paymentAttempt.provider !== "STRIPE" ||
      fundTransaction.id !==
        fundTransactionId ||
      fundTransaction.type !== "DEPOSIT"
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Stripe payment does not match deposit",
        data: null,
      });
    }

    /*
     * The Checkout session must be the exact
     * session we stored on PaymentAttempt.
     */
    if (
      paymentAttempt.providerReference &&
      paymentAttempt.providerReference !==
        session.id
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Stripe checkout reference mismatch",
        data: null,
      });
    }

    // --------------------------------
    // VERIFY PSP AMOUNT + CURRENCY
    // --------------------------------

    const expectedAmount =
      decimalToMinorUnits(
        paymentAttempt.amount
      );

    if (
      session.amount_total !==
        expectedAmount ||
      session.currency?.toUpperCase() !==
        paymentAttempt.currency.toUpperCase()
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Stripe payment amount or currency mismatch",
        data: null,
      });
    }

    // --------------------------------
    // PAYMENT SUCCESS
    // --------------------------------

    const paid =
      session.payment_status === "paid" &&
      (
        event.type ===
          "checkout.session.completed" ||
        event.type ===
          "checkout.session.async_payment_succeeded"
      );

    if (paid) {
      if (
        !fundTransaction.accountId ||
        !fundTransaction.convertedAmount
      ) {
        return res.status(500).json({
          statusCode: 500,
          message:
            "Deposit transaction is incomplete",
          data: null,
        });
      }

      const paymentIntentId =
        typeof session.payment_intent ===
        "string"
          ? session.payment_intent
          : session.payment_intent?.id ??
            null;

      // --------------------------------
      // COMPLETE DEPOSIT ATOMICALLY
      // --------------------------------

      await prisma.$transaction(
        async (tx) => {
          /*
           * Atomic claim.
           *
           * Only one webhook delivery is allowed
           * to change this attempt from PENDING
           * to COMPLETED.
           */
          const claimed =
            await tx.paymentAttempt.updateMany({
              where: {
                id: paymentAttempt.id,
                status: "PENDING",
              },

              data: {
                status: "COMPLETED",
                completedAt: new Date(),

                providerReference:
                  session.id,

                ...(paymentIntentId
                  ? {
                      providerPaymentId:
                        paymentIntentId,
                    }
                  : {}),
              },
            });

          /*
           * Stripe can deliver the same event
           * multiple times.
           *
           * If another delivery already completed
           * this attempt, DO NOT credit again.
           */
          if (claimed.count === 0) {
            return;
          }

          // Complete the financial transaction.
          await tx.fundTransaction.update({
            where: {
              id: fundTransaction.id,
            },

            data: {
              status: "COMPLETED",
              completedAt: new Date(),
            },
          });

          // Credit trading account exactly once.
          await tx.tradingAccount.update({
            where: {
              id: fundTransaction.accountId!,
            },

            data: {
              balance: {
                increment:
                  fundTransaction.convertedAmount!,
              },
            },
          });
        }
      );

      return res.status(200).json({
        received: true,
      });
    }

    // --------------------------------
    // FAILED / EXPIRED PAYMENT
    // --------------------------------

    if (
      event.type ===
      "checkout.session.async_payment_failed"
    ) {
      await prisma.paymentAttempt.updateMany({
        where: {
          id: paymentAttempt.id,
          status: "PENDING",
        },

        data: {
          status: "FAILED",
        },
      });
    }

    if (
      event.type ===
      "checkout.session.expired"
    ) {
      await prisma.paymentAttempt.updateMany({
        where: {
          id: paymentAttempt.id,
          status: "PENDING",
        },

        data: {
          status: "CANCELLED",
        },
      });
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(
      "Stripe funds webhook processing failed:",
      event.id,
      error
    );

    /*
     * Return 500 so Stripe retries transient
     * processing/database failures.
     */
    return res.status(500).json({
      statusCode: 500,
      message:
        "Stripe webhook processing failed",
      data: null,
    });
  }
};