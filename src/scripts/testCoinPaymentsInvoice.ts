
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { coinPaymentsRequest } from "../modules/funds/providers/coinpayments.client.js";
import { coinPaymentsConfig } from "../config/coinpayments.js";

async function main() {
  const refundEmail =
    process.env.COINPAYMENTS_REFUND_EMAIL;

  if (!refundEmail) {
    throw new Error(
      "COINPAYMENTS_REFUND_EMAIL_REQUIRED"
    );
  }

  const invoice = await coinPaymentsRequest<unknown>(
    "POST",
    "/api/v2/merchant/invoices",
    {
      currency: "USD",

      items: [
        {
          name: "Trading account deposit",
          description: "TradeStack LTCT integration test",
          quantity: {
            value: 1,
            type: "quantity",
          },
          amount: "10.00",
        },
      ],

      amount: {
        total: "10.00",
      },

      description: "TradeStack LTCT integration test",

      invoiceId: `test-${randomUUID()}`,

      payment: {
        paymentCurrency:
          coinPaymentsConfig.currencies.LTCT.id,
        refundEmail,
      },
    }
  );

  console.log(
    "CoinPayments invoice response:",
    JSON.stringify(invoice, null, 2)
  );
}

main().catch((error) => {
  console.error("Invoice test failed:", error);
  process.exitCode = 1;
});
