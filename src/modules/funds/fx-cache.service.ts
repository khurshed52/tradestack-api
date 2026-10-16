import { Prisma } from "../../generated/prisma/client.js";

import {
  getExchangeRate,
  type FxQuote,
} from "./fx.service.js";

import {
  cacheGet,
  cacheSet,
} from "../../utils/cache.js";

const FX_CACHE_TTL_SECONDS = 60;

export const getCachedExchangeRate = async (
  fromCurrency: string,
  toCurrency: string
): Promise<FxQuote> => {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();

  // Preserve existing validation and same-currency behavior.
  // Do not use cached data for invalid currency codes.
  if (
    !/^[A-Z]{3}$/.test(from) ||
    !/^[A-Z]{3}$/.test(to) ||
    from === to
  ) {
    return getExchangeRate(fromCurrency, toCurrency);
  }

  const cacheKey = `fx:preview:v1:${from}:${to}`;

  const cached = await cacheGet(cacheKey);

  if (cached) {
    try {
      const data: unknown = JSON.parse(cached);

      if (
        typeof data === "object" &&
        data !== null &&
        !Array.isArray(data)
      ) {
        const value = data as Record<string, unknown>;

        if (
          value.fromCurrency === from &&
          value.toCurrency === to &&
          typeof value.rate === "string" &&
          typeof value.source === "string" &&
          typeof value.quotedAt === "string" &&
          (typeof value.providerDate === "string" ||
            value.providerDate === null) &&
          /^\d+(\.\d+)?$/.test(value.rate)
        ) {
          const rate = new Prisma.Decimal(value.rate);
          const quotedAt = new Date(value.quotedAt);

          if (
            rate.isFinite() &&
            rate.greaterThan(0) &&
            !Number.isNaN(quotedAt.getTime())
          ) {
            return {
              fromCurrency: from,
              toCurrency: to,
              rate,
              source: value.source,
              quotedAt,
              providerDate: value.providerDate,
            };
          }
        }
      }
    } catch {
      // Invalid cached data: fetch a fresh quote instead.
    }
  }

  // Cache miss or invalid cache entry.
  const quote = await getExchangeRate(from, to);

  await cacheSet(
    cacheKey,
    JSON.stringify({
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      rate: quote.rate.toString(),
      source: quote.source,
      quotedAt: quote.quotedAt.toISOString(),
      providerDate: quote.providerDate,
    }),
    FX_CACHE_TTL_SECONDS
  );

  return quote;
};