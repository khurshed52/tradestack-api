import { coinPaymentsRequest } from "../modules/funds/providers/coinpayments.client.js";

type MerchantCurrenciesResponse = {
  items: unknown[];
  paging?: unknown;
};

async function main() {
  try {
    const result =
      await coinPaymentsRequest<MerchantCurrenciesResponse>(
        "GET",
        "/api/v1/merchant/currencies"
      );

    console.log("CoinPayments authentication successful!");

    console.log("Merchant currencies:", result.items.length);

    console.log(
      JSON.stringify(result.items.slice(0, 5), null, 2)
    );
  } catch (error) {
    console.error("CoinPayments authentication failed:", error);
    process.exitCode = 1;
  }
}

void main();