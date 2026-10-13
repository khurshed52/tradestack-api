
import "dotenv/config";

import { coinPaymentsRequest } from "../modules/funds/providers/coinpayments.client.js";

async function main() {
  const invoiceId =
    "4e74deea-3a2d-4091-ad32-81601388ffe6";

  const invoice = await coinPaymentsRequest<unknown>(
    "GET",
    `/api/v2/merchant/invoices/${invoiceId}`
  );

  console.log(
    "CoinPayments invoice:",
    JSON.stringify(invoice, null, 2)
  );
}

main().catch((error) => {
  console.error("Invoice lookup failed:", error);
  process.exitCode = 1;
});
