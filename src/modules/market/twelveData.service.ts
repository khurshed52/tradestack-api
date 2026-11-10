
import "dotenv/config";

import { setTimeout as sleep } from "node:timers/promises";

import { saveCrypto } from "./crypto.service.js";
import { Prisma } from "../../generated/prisma/client.js";

// --------------------------------
// TWELVE DATA REQUEST CONFIGURATION
// --------------------------------

const TWELVE_DATA_TIMEOUT_MS = 10_000;

const MAX_ATTEMPTS = 3;

const INITIAL_RETRY_DELAY_MS = 300;

const RETRYABLE_STATUS_CODES = new Set([
  429,
  502,
  503,
  504,
]);

// --------------------------------
// FETCH TWELVE DATA QUOTE
// --------------------------------


export async function fetchTwelveDataQuote(
  symbol: string,
  options: {
    signal?: AbortSignal;
  } = {}
) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is missing");
  }

  // --------------------------------
  // 1. BUILD REQUEST URL
  // --------------------------------

  const url = new URL(
    "https://api.twelvedata.com/quote"
  );

  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  // --------------------------------
  // 2. CREATE TOTAL REQUEST DEADLINE
  // --------------------------------

  const timeoutSignal = AbortSignal.timeout(
    TWELVE_DATA_TIMEOUT_MS
  );

  const signal = options.signal
    ? AbortSignal.any([
        options.signal,
        timeoutSignal,
      ])
    : timeoutSignal;

  // --------------------------------
  // 3. REQUEST WITH BOUNDED RETRIES
  // --------------------------------

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    signal.throwIfAborted();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });

      // --------------------------------
      // 4. HANDLE HTTP ERRORS
      // --------------------------------

      if (!response.ok) {
        const canRetry =
          RETRYABLE_STATUS_CODES.has(
            response.status
          ) &&
          attempt < MAX_ATTEMPTS;

        if (!canRetry) {
          throw new Error(
            `TWELVE_DATA_HTTP_${response.status}`
          );
        }

        const retryDelay =
          INITIAL_RETRY_DELAY_MS *
          2 ** (attempt - 1);

        await sleep(retryDelay, undefined, {
          signal,
        });

        continue;
      }

      // --------------------------------
      // 5. HANDLE PROVIDER RESPONSE
      // --------------------------------

      const quote = await response.json();

      signal.throwIfAborted();

      // Provider errors returned with HTTP 200
      // are classified as permanent failures.
      if (quote.status === "error") {
        throw new Error(
          "TWELVE_DATA_PROVIDER_ERROR",
          {
            cause:
              quote.message ||
              "Unknown provider error",
          }
        );
      }

      // --------------------------------
      // 6. RETURN SUCCESSFUL QUOTE
      // --------------------------------

      return quote;
    } catch (error) {
      // Never retry after cancellation.
      if (signal.aborted) {
        throw signal.reason;
      }

      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }

      // Do not retry HTTP errors already
      // classified above or provider errors.
      if (
        error instanceof Error &&
        (
          error.message.startsWith(
            "TWELVE_DATA_HTTP_"
          ) ||
          error.message ===
            "TWELVE_DATA_PROVIDER_ERROR"
        )
      ) {
        throw error;
      }

      // Do not retry abort or timeout errors.
      if (
        error instanceof Error &&
        (
          error.name === "AbortError" ||
          error.name === "TimeoutError"
        )
      ) {
        throw error;
      }

      // Retry only network-level failures.
      if (!(error instanceof TypeError)) {
        throw error;
      }

      const retryDelay =
        INITIAL_RETRY_DELAY_MS *
        2 ** (attempt - 1);

      await sleep(retryDelay, undefined, {
        signal,
      });
    }
  }

  throw new Error(
    "TWELVE_DATA_MAX_ATTEMPTS_EXCEEDED"
  );
}

// --------------------------------
// IMPORT TWELVE DATA QUOTE
// --------------------------------

export async function importTwelveDataQuote(
  symbol: string
) {
  const quote = await fetchTwelveDataQuote(
    symbol
  );

  return saveCrypto({
    symbol: quote.symbol,

    price: quote.close,

    changePercent: new Prisma.Decimal(
      quote.percent_change
    )
      .toDecimalPlaces(8)
      .toFixed(),

    high: quote.high,
    low: quote.low,

    buyPrice: null,
    spread: null,
  });
}
