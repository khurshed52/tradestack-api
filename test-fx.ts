import { getExchangeRate } from "./src/modules/funds/fx.service.js";

async function test() {
  const pairs = [
    ["EUR", "USD"],
    ["USD", "EUR"],
    ["AED", "USD"],
    ["USD", "AED"],
    ["USD", "USD"],
  ] as const;

  for (const [from, to] of pairs) {
    try {
      const quote = await getExchangeRate(
        from,
        to
      );

      console.log(
        `${from} -> ${to}`,
        {
          rate: quote.rate.toString(),
          source: quote.source,
          quotedAt:
            quote.quotedAt.toISOString(),
          providerDate:
            quote.providerDate,
        }
      );
    } catch (error) {
      console.error(
        `${from} -> ${to} FAILED`,
        error
      );
    }
  }
}

test();