import { Prisma } from "../../generated/prisma/client.js";

export type FxQuote = {
  fromCurrency: string;
  toCurrency: string;
  rate: Prisma.Decimal;
  source: string;
  quotedAt: Date;
  providerDate: string | null;
};

type FrankfurterRateResponse = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

const FRANKFURTER_BASE_URL =
  "https://api.frankfurter.dev/v2";

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;

export const getExchangeRate = async (
  fromCurrency: string,
  toCurrency: string
): Promise<FxQuote> => {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();

if (!CURRENCY_CODE_REGEX.test(from)) {
  throw new Error(
    `Invalid source currency: ${from}`
  );
}

if (!CURRENCY_CODE_REGEX.test(to)) {
  throw new Error(
    `Invalid target currency: ${to}`
  );
}

  /*
   * No external FX request is required when both
   * currencies are the same.
   */
  if (from === to) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: new Prisma.Decimal(1),
      source: "INTERNAL",
      quotedAt: new Date(),
      providerDate: null,
    };
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    const url =
      `${FRANKFURTER_BASE_URL}/rate/` +
      `${from.toLowerCase()}/${to.toLowerCase()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Frankfurter returned HTTP ${response.status}`
      );
    }

    const data =
      (await response.json()) as FrankfurterRateResponse;

    if (
      !data ||
      typeof data.rate !== "number" ||
      !Number.isFinite(data.rate) ||
      data.rate <= 0
    ) {
      throw new Error(
        "Frankfurter returned an invalid exchange rate"
      );
    }

    return {
      fromCurrency: from,
      toCurrency: to,

      /*
       * Convert from the JSON number into Prisma Decimal
       * before using the value in financial calculations.
       */
      rate: new Prisma.Decimal(
        data.rate.toString()
      ),

      source: "FRANKFURTER",

      quotedAt: new Date(),

      providerDate:
        typeof data.date === "string"
          ? data.date
          : null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Exchange rate provider timed out"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};