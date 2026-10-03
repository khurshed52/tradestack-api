import { Prisma } from "../../../generated/prisma/client.js";
import { stripe } from "../../../config/stripe.js";

import type {
  CreateDepositPaymentInput,
  CreateDepositPaymentResult,
  PaymentProviderAdapter,
} from "./paymentProvider.js";

const toMinorUnits = (
  amount: string
): number => {
  const decimal = new Prisma.Decimal(amount);

  const minorUnits = decimal
    .mul(100)
    .toDecimalPlaces(
      0,
      Prisma.Decimal.ROUND_HALF_UP
    );

  const value = Number(minorUnits.toString());

  if (!Number.isSafeInteger(value)) {
    throw new Error("INVALID_PAYMENT_AMOUNT");
  }

  return value;
};

export const stripePaymentProvider:
  PaymentProviderAdapter = {

  async createDepositPayment(
    input: CreateDepositPaymentInput
  ): Promise<CreateDepositPaymentResult> {

    const amountInMinorUnits =
      toMinorUnits(input.amount);

    const frontendUrl = (
      process.env.FRONTEND_URL ??
      "http://localhost:3001"
    ).replace(/\/$/, "");

    const session =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",

          payment_method_types: [
            "card",
          ],

          client_reference_id:
            input.fundTransactionId,

          metadata: {
            paymentAttemptId:
              input.paymentAttemptId,

            fundTransactionId:
              input.fundTransactionId,

            accountNumber:
              input.accountNumber,

            transactionType:
              "DEPOSIT",
          },

          payment_intent_data: {
            metadata: {
              paymentAttemptId:
                input.paymentAttemptId,

              fundTransactionId:
                input.fundTransactionId,

              accountNumber:
                input.accountNumber,

              transactionType:
                "DEPOSIT",
            },
          },

          line_items: [
            {
              price_data: {
                currency:
                  input.currency.toLowerCase(),

                unit_amount:
                  amountInMinorUnits,

                product_data: {
                  name:
                    `Deposit to account ${input.accountNumber}`,
                },
              },

              quantity: 1,
            },
          ],

          success_url:
            `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${frontendUrl}/payment/cancel`,
        },
        {
          idempotencyKey:
            `deposit:${input.paymentAttemptId}`,
        }
      );

    if (!session.url) {
      throw new Error(
        "PAYMENT_CHECKOUT_URL_UNAVAILABLE"
      );
    }

    return {
      providerReference: session.id,
      checkoutUrl: session.url,
    };
  },
};