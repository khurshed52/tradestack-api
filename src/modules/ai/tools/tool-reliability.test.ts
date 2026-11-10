
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { fetchTwelveDataQuote } from "../../market/twelveData.service.js";
import { executeAiTool } from "./tool-executor.js";

// --------------------------------
// ORIGINAL GLOBAL VALUES
// --------------------------------

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.TWELVE_DATA_API_KEY;

// --------------------------------
// TEST SETUP
// --------------------------------

before(() => {
  process.env.TWELVE_DATA_API_KEY = "test-key";
});

// --------------------------------
// TEST CLEANUP
// --------------------------------

after(() => {
  globalThis.fetch = originalFetch;

  if (originalApiKey === undefined) {
    delete process.env.TWELVE_DATA_API_KEY;
  } else {
    process.env.TWELVE_DATA_API_KEY =
      originalApiKey;
  }
});

// --------------------------------
// MOCK QUOTE
// --------------------------------

function mockQuote() {
  return {
    symbol: "EUR/USD",
    close: "1.11465",
    percent_change: "-0.68",
    datetime: "2026-11-06",
  };
}

// --------------------------------
// TEST 1: RETRY THEN SUCCESS
// --------------------------------

test("Twelve Data retries 503 and succeeds", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts++;

    // First request fails.
    if (attempts === 1) {
      return new Response(null, {
        status: 503,
      });
    }

    // Second request succeeds.
    return Response.json(mockQuote());
  };

  const result = await fetchTwelveDataQuote(
    "EUR/USD"
  );

  assert.equal(attempts, 2);
  assert.equal(result.symbol, "EUR/USD");
});

// --------------------------------
// TEST 2: PERMANENT PROVIDER ERROR
// --------------------------------

test("Twelve Data does not retry provider errors", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts++;

    return Response.json({
      status: "error",
      message: "Invalid symbol",
    });
  };

  await assert.rejects(
    () => fetchTwelveDataQuote("INVALID"),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "TWELVE_DATA_PROVIDER_ERROR" &&
      error.cause === "Invalid symbol"
  );

  // Provider error must fail immediately.
  assert.equal(attempts, 1);
});

// --------------------------------
// TEST 3: CANCELLATION DURING RETRY
// --------------------------------

test("Twelve Data stops retrying when cancelled", async () => {
  let attempts = 0;

  const controller = new AbortController();

  globalThis.fetch = async () => {
    attempts++;

    return new Response(null, {
      status: 503,
    });
  };

  const operation = fetchTwelveDataQuote(
    "EUR/USD",
    {
      signal: controller.signal,
    }
  );

  // Cancel during the retry delay.
  const timer = setTimeout(() => {
    controller.abort(
      new Error("TEST_CANCELLED")
    );
  }, 100);

  try {
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof Error &&
        error.message === "TEST_CANCELLED"
    );

    // No second HTTP request should occur.
    assert.equal(attempts, 1);
  } finally {
    clearTimeout(timer);
  }
});

// --------------------------------
// TEST 4: EXECUTOR ALLOWLIST
// --------------------------------

test("Executor rejects unknown tools", async () => {
  await assert.rejects(
    () =>
      executeAiTool(
        "delete_all_accounts",
        {}
      ),
    /AI_TOOL_NOT_ALLOWED/
  );
});

// --------------------------------
// TEST 5: EXECUTOR ARGUMENT VALIDATION
// --------------------------------

test("Executor rejects invalid tool arguments", async () => {
  await assert.rejects(
    () =>
      executeAiTool("get_market_price", {
        symbol: "",
      })
  );
});
