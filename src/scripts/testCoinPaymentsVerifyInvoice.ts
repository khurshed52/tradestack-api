
import "dotenv/config";

import { verifyCoinPaymentsInvoice } from "../modules/funds/providers/coinpayments.verifyInvoice.js";

async function main() {
  const verified = await verifyCoinPaymentsInvoice({
    providerReference:
      "4e74deea-3a2d-4091-ad32-81601388ffe6",

    paymentAttemptId:
      "test-972ae5dc-91ae-41d4-8458-ee77d5f0ba98",

    expectedAmount: "10.00",

    expectedCurrency: "USD",
  });

  console.log("Invoice verified:", verified);

  if (verified) {
    throw new Error(
      "SECURITY_TEST_FAILED: Unpaid invoice was accepted"
    );
  }

  console.log("PASS: Unpaid invoice correctly rejected");
}

main().catch((error) => {
  console.error("Invoice verification test failed:", error);
  process.exitCode = 1;
});
