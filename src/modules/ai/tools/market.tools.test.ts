
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { executeMarketNews } from "./market.tools.js";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.MARKET_AUX_API_KEY;

before(() => {
  // No real Marketaux API calls during testing.
  process.env.MARKET_AUX_API_KEY = "test-key";
});

after(() => {
  globalThis.fetch = originalFetch;

  if (originalApiKey === undefined) {
    delete process.env.MARKET_AUX_API_KEY;
  } else {
    process.env.MARKET_AUX_API_KEY = originalApiKey;
  }
});

test("Marketaux retries HTTP 503 and succeeds", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts++;

    // First attempt fails.
    if (attempts === 1) {
      return new Response(null, {
        status: 503,
      });
    }

    // Second attempt succeeds.
    return new Response(
      JSON.stringify({
        data: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  };

  // Unique topic prevents a previous Redis
  // cache entry from bypassing our mock.
  const topic = `test-${randomUUID()}`;

  const result = await executeMarketNews({
    topic,
  });

  assert.equal(attempts, 2);
  assert.equal(result.source, "Marketaux");
  assert.deepEqual(result.articles, []);
});


test("Marketaux stops after 3 HTTP 503 failures", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts++;

    return new Response(null, {
      status: 503,
    });
  };

  // Unique topic avoids existing Redis entries.
  const topic = `test-${randomUUID()}`;

  await assert.rejects(
    () => executeMarketNews({ topic }),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "MARKETAUX_REQUEST_FAILED_503"
  );

  // Initial request + 2 retries.
  assert.equal(attempts, 3);
});



test("Marketaux does not retry HTTP 400", async () => {
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts++;

    return new Response(null, {
      status: 400,
    });
  };

  // Avoid Redis cache hits.
  const topic = `test-${randomUUID()}`;

  await assert.rejects(
    () => executeMarketNews({ topic }),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "MARKETAUX_REQUEST_FAILED_400"
  );

  // A permanent HTTP error must not be retried.
  assert.equal(attempts, 1);
});



test("Marketaux respects Retry-After on HTTP 429", async () => {
  let attempts = 0;

  const startedAt = performance.now();

  globalThis.fetch = async () => {
    attempts++;

    if (attempts === 1) {
      return new Response(null, {
        status: 429,
        headers: {
          "Retry-After": "1",
        },
      });
    }

    return new Response(
      JSON.stringify({
        data: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  };

  const topic = `test-${randomUUID()}`;

  const result = await executeMarketNews({
    topic,
  });

  const elapsedMs = performance.now() - startedAt;

  assert.equal(attempts, 2);
  assert.equal(result.source, "Marketaux");

  // Retry-After: 1 means wait approximately
  // one second before retrying.
  assert.ok(
    elapsedMs >= 900,
    `Expected at least ~1 second, got ${elapsedMs}ms`
  );
});


test("Marketaux stops retrying when cancelled", async () => {
  let attempts = 0;

  const controller = new AbortController();

  globalThis.fetch = async () => {
    attempts++;

    // Simulate a temporary failure.
    return new Response(null, {
      status: 503,
    });
  };

  const topic = `test-${randomUUID()}`;

  // Start the tool request.
  const operation = executeMarketNews(
    { topic },
    controller.signal
  );

  // Cancel during the 300ms retry delay.
  const timer = setTimeout(() => {
    controller.abort(
      new Error("TEST_REQUEST_CANCELLED")
    );
  }, 100);

  try {
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          "TEST_REQUEST_CANCELLED"
    );

    // Cancellation must prevent attempt #2.
    assert.equal(attempts, 1);
  } finally {
    clearTimeout(timer);
  }
});
