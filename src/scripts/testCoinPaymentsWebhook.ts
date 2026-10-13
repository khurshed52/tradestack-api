
import "dotenv/config";

import { generateCoinPaymentsSignature } from "../modules/funds/providers/coinpayments.signature.js";
import { coinPaymentsConfig } from "../config/coinpayments.js";

async function main() {
  const url = process.env.COINPAYMENTS_WEBHOOK_URL;

  if (!url) {
    throw new Error("COINPAYMENTS_WEBHOOK_URL_REQUIRED");
  }

  if (
    !coinPaymentsConfig.clientId ||
    !coinPaymentsConfig.clientSecret
  ) {
    throw new Error("COINPAYMENTS_CREDENTIALS_MISSING");
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "");

  const payload = JSON.stringify({
    type: "invoiceCompleted",
    test: true,
  });

  const signature = generateCoinPaymentsSignature({
    method: "POST",
    url,
    clientId: coinPaymentsConfig.clientId,
    clientSecret: coinPaymentsConfig.clientSecret,
    timestamp,
    payload,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CoinPayments-Client": coinPaymentsConfig.clientId,
      "X-CoinPayments-Timestamp": timestamp,
      "X-CoinPayments-Signature": signature,
    },
    body: payload,
  });

  console.log("Webhook test HTTP status:", response.status);
  console.log("Webhook test response:", await response.text());
}

main().catch((error) => {
  console.error("Webhook test failed:", error);
  process.exitCode = 1;
});
