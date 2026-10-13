import { coinPaymentsConfig } from "../../../config/coinpayments.js";

import { coinPaymentsRequest } from "./coinpayments.client.js";

import type {
  PaymentProviderAdapter,
  CreateDepositPaymentInput,
  CreateDepositPaymentResult,
} from "./paymentProvider.js";

type CoinPaymentsInvoiceResponse = {
  invoices: Array<{
    id: string;
    checkoutLink: string;
  }>;
};

export const coinPaymentsProvider: PaymentProviderAdapter = {
  async createDepositPayment(
    input: CreateDepositPaymentInput
  ): Promise<CreateDepositPaymentResult> {
    if (!coinPaymentsConfig.enabled) {
      throw new Error("COINPAYMENTS_DISABLED");
    }

    // Testing only: use merchant-enabled Litecoin Test.
 
const payload = {
  currency: input.currency,

  items: [
    {
      name: "Trading account deposit",
      description: `TradeStack deposit ${input.fundTransactionId}`,
      quantity: {
        value: 1,
        type: "quantity",
      },
      amount: input.amount,
    },
  ],

  amount: {
    total: input.amount,
  },

  description: `TradeStack deposit ${input.fundTransactionId}`,

  invoiceId: input.paymentAttemptId,

  payment: {
    paymentCurrency:
      coinPaymentsConfig.currencies.LTCT.id,
    refundEmail:
      process.env.COINPAYMENTS_REFUND_EMAIL ?? "",
  },
};


    const data =
      await coinPaymentsRequest<CoinPaymentsInvoiceResponse>(
        "POST",
        "/api/v2/merchant/invoices",
        payload
      );

    const invoice = data.invoices?.[0];

    if (!invoice?.id || !invoice?.checkoutLink) {
      throw new Error("COINPAYMENTS_INVALID_INVOICE_RESPONSE");
    }

    return {
      providerReference: invoice.id,
      checkoutUrl: invoice.checkoutLink,
    };
  },
};