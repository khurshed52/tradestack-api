
import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";

import { fetchTwelveDataQuote } from "../../market/twelveData.service.js";
import { cacheGet, cacheSet } from "../../../utils/cache.js";
// --------------------------------
// MARKET TOOL DECLARATIONS
// --------------------------------

export const marketTools: FunctionDeclaration[] = [
  {
    name: "get_market_price",

    description:
      "Retrieve the latest available market price for a financial instrument. " +
      "Use when the user asks for current or live prices of forex pairs, " +
      "gold, silver, commodities, or cryptocurrencies. " +
      "Never invent market prices.",

    parametersJsonSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description:
            "Instrument symbol such as EUR/USD, XAU/USD, or BTC/USD.",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },

  {
    name: "get_latest_market_news",

    description:
      "Retrieve recent financial market news with article headlines, " +
      "descriptions, images, publication dates, and original publisher URLs. " +
      "Use when users ask about recent financial headlines, gold, forex, " +
      "cryptocurrency news, or economic developments. " +
      "Use a specific topic when the user mentions one.",

    parametersJsonSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Optional topic, such as gold, forex, Bitcoin, or stock markets.",
        },
      },
      additionalProperties: false,
    },
  },
];

// --------------------------------
// MARKET PRICE ARGUMENT VALIDATION
// --------------------------------

export const marketPriceArgsSchema = z
  .object({
    symbol: z.string().trim().min(1).max(30),
  })
  .strict();

// --------------------------------
// TWELVE DATA RESPONSE VALIDATION
// --------------------------------

const marketQuoteSchema = z.object({
  symbol: z.string().min(1),

  close: z.coerce.number().positive().finite(),

  currency: z.string().optional(),

  percent_change: z
    .union([z.string(), z.number()])
    .optional(),

  datetime: z.string().optional(),
});

// --------------------------------
// EXECUTE MARKET PRICE TOOL
// --------------------------------



export async function executeMarketPrice(
  args: z.infer<typeof marketPriceArgsSchema>,
  signal?: AbortSignal
) {
  const CACHE_TTL_SECONDS = 20;

  const symbol = args.symbol.trim().toUpperCase();

  const cacheKey =
    `tradepro:ai:market:price:${symbol}`;

  // --------------------------------
  // 1. CHECK CANCELLATION
  // --------------------------------

  signal?.throwIfAborted();

  // --------------------------------
  // 2. CHECK REDIS
  // --------------------------------

  const cached = await cacheGet(cacheKey);

  signal?.throwIfAborted();

  if (cached !== null) {
    try {
      const cachedQuote = marketQuoteSchema.parse(
        JSON.parse(cached)
      );

      return {
        symbol: cachedQuote.symbol,
        price: cachedQuote.close,
        currency: cachedQuote.currency ?? null,
        changePercent:
          cachedQuote.percent_change ?? null,
        timestamp: cachedQuote.datetime ?? null,
        source: "Twelve Data",
      };
    } catch {
      console.warn(
        "Invalid cached market quote:",
        symbol
      );
    }
  }

  // --------------------------------
  // 3. FETCH WITH ABORT SIGNAL
  // --------------------------------

  signal?.throwIfAborted();

  const rawQuote = await fetchTwelveDataQuote(
    symbol,
    { signal }
  );

  signal?.throwIfAborted();

  // --------------------------------
  // 4. VALIDATE PROVIDER DATA
  // --------------------------------

  const quote = marketQuoteSchema.parse(rawQuote);

  // --------------------------------
  // 5. SAVE TO REDIS
  // --------------------------------

  await cacheSet(
    cacheKey,
    JSON.stringify({
      symbol: quote.symbol,
      close: quote.close,
      currency: quote.currency,
      percent_change: quote.percent_change,
      datetime: quote.datetime,
    }),
    CACHE_TTL_SECONDS
  );

  signal?.throwIfAborted();

  // --------------------------------
  // 6. RETURN VERIFIED QUOTE
  // --------------------------------

  return {
    symbol: quote.symbol,
    price: quote.close,
    currency: quote.currency ?? null,
    changePercent:
      quote.percent_change ?? null,
    timestamp: quote.datetime ?? null,
    source: "Twelve Data",
  };
}


// --------------------------------
// MARKET NEWS ARGUMENT VALIDATION
// --------------------------------

export const marketNewsArgsSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();

// --------------------------------
// MARKETAUX RESPONSE VALIDATION
// --------------------------------

const marketauxArticleSchema = z.object({
  title: z.string().min(1),

  description: z
    .string()
    .nullable()
    .optional(),

  url: z.string().url(),

  // Original article image provided by Marketaux.
  // Some articles may not have an image.
  image_url: z
    .string()
    .url()
    .nullable()
    .optional(),

  published_at: z.string().min(1),

  source: z
    .string()
    .nullable()
    .optional(),
});

const marketauxResponseSchema = z.object({
  data: z.array(marketauxArticleSchema),
});

// --------------------------------
// SAFE PUBLIC URL VALIDATION
// --------------------------------

function normalizePublicUrl(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

// --------------------------------
// EXECUTE MARKET NEWS TOOL
// --------------------------------

function isRelevantMarketNews(
  article: {
    title: string;
    description?: string | null;
  },
  topic?: string
): boolean {
  if (!topic?.trim()) {
    return true;
  }

  const normalizedTopic = topic.trim().toLowerCase();

  const text = [
    article.title,
    article.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // Common financial-market synonyms.
  const topicKeywords: Record<string, string[]> = {
    gold: [
      "gold",
      "bullion",
      "goldmine",
      "gold mine",
      "gold mining",
      "xau",
    ],
    silver: ["silver", "xag"],
    bitcoin: ["bitcoin", "btc"],
    crypto: [
      "crypto",
      "cryptocurrency",
      "bitcoin",
      "ethereum",
    ],
    forex: [
      "forex",
      "foreign exchange",
      "currency",
      "currencies",
    ],
  };

  const keywords =
    topicKeywords[normalizedTopic] ??
    [normalizedTopic];

  return keywords.some((keyword) => {
    // Match whole terms rather than substrings.
    const escaped = keyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    return new RegExp(
      `(^|[^a-z0-9])${escaped}($|[^a-z0-9])`,
      "i"
    ).test(text);
  });
}


const NEWS_CACHE_TTL_SECONDS = 300;
const NEWS_MAX_AGE_DAYS = 7;

// --------------------------------
// VALIDATE CACHED MARKET NEWS
// --------------------------------

const cachedMarketNewsSchema = z.object({
  topic: z.string().nullable(),

  articles: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().nullable(),
      url: z.string().url(),
      imageUrl: z.string().url().nullable(),
      publishedAt: z.string(),
      source: z.string().nullable(),
    })
  ),

  source: z.literal("Marketaux"),
});

// --------------------------------
// FETCH FRESH NEWS FROM MARKETAUX
// --------------------------------


const MARKETAUX_MAX_ATTEMPTS = 3;
const MARKETAUX_RETRY_DELAY_MS = 300;
const MARKETAUX_TIMEOUT_MS = 10_000;

const MARKETAUX_RETRYABLE_STATUS = new Set([
  429,
  502,
  503,
  504,
]);

async function waitForRetry(
  delayMs: number,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    }

    signal.addEventListener("abort", onAbort, {
      once: true,
    });

    if (signal.aborted) {
      onAbort();
    }
  });
}

function getMarketauxRetryDelay(
  response: Response,
  attempt: number
): number {
  const defaultDelay =
    MARKETAUX_RETRY_DELAY_MS *
    2 ** (attempt - 1);

  if (response.status !== 429) {
    return defaultDelay;
  }

  const retryAfter =
    response.headers.get("retry-after");

  if (!retryAfter) {
    return defaultDelay;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(retryAfter);

  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return defaultDelay;
}


async function fetchFreshMarketNews(
  args: z.infer<typeof marketNewsArgsSchema>,
  signal?: AbortSignal
) {
  const apiKey = process.env.MARKET_AUX_API_KEY;

  if (!apiKey) {
    throw new Error("MARKETAUX_API_KEY_MISSING");
  }

  // --------------------------------
  // 1. NEWS FRESHNESS
  // --------------------------------

  signal?.throwIfAborted();

  const now = Date.now();

  const cutoff = new Date(
    now - NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );

  // --------------------------------
  // 2. BUILD MARKETAUX QUERY
  // --------------------------------

  const params = new URLSearchParams({
    api_token: apiKey,
    language: "en",
    limit: "5",
    sort: "published_at",
    published_after: cutoff
      .toISOString()
      .slice(0, 19),
    group_similar: "true",
  });

  if (args.topic) {
    params.set("search", args.topic);
  }

  // --------------------------------
  // 3. COMBINE CANCELLATION SIGNALS
  // --------------------------------

  // This deadline covers ALL attempts,
  // including retry delays.
  const requestSignal = signal
    ? AbortSignal.any([
        signal,
        AbortSignal.timeout(MARKETAUX_TIMEOUT_MS),
      ])
    : AbortSignal.timeout(MARKETAUX_TIMEOUT_MS);

  requestSignal.throwIfAborted();

  // --------------------------------
  // 4. FETCH WITH BOUNDED RETRIES
  // --------------------------------

  let parsed:
    | z.infer<typeof marketauxResponseSchema>
    | undefined;

  const url =
    `https://api.marketaux.com/v1/news/all?${params.toString()}`;

  for (
    let attempt = 1;
    attempt <= MARKETAUX_MAX_ATTEMPTS;
    attempt++
  ) {
    requestSignal.throwIfAborted();

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: requestSignal,
      });
    } catch (error) {
      // Never retry cancellation.
      if (requestSignal.aborted) {
        throw requestSignal.reason;
      }

      // Fetch network failures commonly surface
      // as TypeError in Node.js.
      if (
        !(error instanceof TypeError) ||
        attempt === MARKETAUX_MAX_ATTEMPTS
      ) {
        throw error;
      }

      const delayMs =
        MARKETAUX_RETRY_DELAY_MS *
        2 ** (attempt - 1);

      await waitForRetry(delayMs, requestSignal);

      continue;
    }

    if (!response.ok) {
      const retryable =
        MARKETAUX_RETRYABLE_STATUS.has(
          response.status
        );

      if (
        !retryable ||
        attempt === MARKETAUX_MAX_ATTEMPTS
      ) {
        throw new Error(
          `MARKETAUX_REQUEST_FAILED_${response.status}`
        );
      }

      const delayMs = getMarketauxRetryDelay(
        response,
        attempt
      );

      // A long Retry-After delay must never
      // override the tool's cancellation signal.
      await waitForRetry(delayMs, requestSignal);

      continue;
    }

    // --------------------------------
    // 5. VALIDATE PROVIDER RESPONSE
    // --------------------------------

    // Invalid JSON or schema failures are
    // not retried.
    const json: unknown = await response.json();

    requestSignal.throwIfAborted();

    parsed = marketauxResponseSchema.parse(json);

    break;
  }

  if (!parsed) {
    throw new Error("MARKETAUX_NO_VALID_RESPONSE");
  }

  requestSignal.throwIfAborted();

  // --------------------------------
  // 6. FILTER AND NORMALIZE ARTICLES
  // --------------------------------

  const articles = parsed.data
    .filter((article) => {
      const publishedAt = Date.parse(
        article.published_at
      );

      const isFresh =
        Number.isFinite(publishedAt) &&
        publishedAt >= cutoff.getTime() &&
        publishedAt <= now;

      const isRelevant = isRelevantMarketNews(
        article,
        args.topic
      );

      return isFresh && isRelevant;
    })
    .map((article) => ({
      title: article.title.trim(),

      description:
        article.description?.trim() || null,

      url: normalizePublicUrl(article.url),

      imageUrl: normalizePublicUrl(
        article.image_url
      ),

      publishedAt: article.published_at,

      source: article.source ?? null,
    }))
    .filter(
      (
        article
      ): article is typeof article & {
        url: string;
      } => article.url !== null
    );

  requestSignal.throwIfAborted();

  // --------------------------------
  // 7. SORT NEWEST FIRST
  // --------------------------------

  articles.sort(
    (a, b) =>
      Date.parse(b.publishedAt) -
      Date.parse(a.publishedAt)
  );

  // --------------------------------
  // 8. REMOVE DUPLICATE STORIES
  // --------------------------------

  const seen = new Set<string>();

  const uniqueArticles = articles.filter(
    (article) => {
      const key = [
        article.title.toLowerCase(),
        (article.source ?? "").toLowerCase(),
      ].join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );

  requestSignal.throwIfAborted();

  // --------------------------------
  // 9. RETURN VALIDATED NEWS
  // --------------------------------

  return {
    topic: args.topic ?? null,
    articles: uniqueArticles,
    source: "Marketaux" as const,
  };
}


// --------------------------------

export async function executeMarketNews(
  args: z.infer<typeof marketNewsArgsSchema>,
  signal?: AbortSignal
) {
  // --------------------------------
  // 1. VALIDATE AND NORMALIZE TOPIC
  // --------------------------------

  signal?.throwIfAborted();

  const validatedArgs =
    marketNewsArgsSchema.parse(args);

  const topic =
    validatedArgs.topic
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, " ") ?? "";

  const normalizedArgs = {
    topic: topic || undefined,
  };

  const cacheKey =
    `tradepro:ai:market:news:v1:${encodeURIComponent(
      topic || "general"
    )}`;

  // --------------------------------
  // 2. CHECK REDIS
  // --------------------------------

  signal?.throwIfAborted();

  const cached = await cacheGet(cacheKey);

  signal?.throwIfAborted();

  if (cached !== null) {
    try {
      const parsed = cachedMarketNewsSchema.parse(
        JSON.parse(cached)
      );

      const now = Date.now();

      const cutoff =
        now -
        NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

      // Cached articles must still be
      // within our seven-day news window.
      const allFresh = parsed.articles.every(
        (article) => {
          const publishedAt = Date.parse(
            article.publishedAt
          );

          return (
            Number.isFinite(publishedAt) &&
            publishedAt >= cutoff &&
            publishedAt <= now
          );
        }
      );

      // Verify topic relevance on cache hits.
      const allRelevant = parsed.articles.every(
        (article) =>
          isRelevantMarketNews(
            {
              title: article.title,
              description: article.description,
            },
            normalizedArgs.topic
          )
      );

      if (
        parsed.topic ===
          (normalizedArgs.topic ?? null) &&
        allFresh &&
        allRelevant
      ) {
        signal?.throwIfAborted();

        return parsed;
      }
    } catch {
      console.warn(
        "Invalid cached Marketaux data:",
        cacheKey
      );
    }
  }

  // --------------------------------
  // 3. FETCH FRESH NEWS
  // --------------------------------

  signal?.throwIfAborted();

  const result = await fetchFreshMarketNews(
    normalizedArgs,
    signal
  );

  signal?.throwIfAborted();

  // --------------------------------
  // 4. VALIDATE RESULT
  // --------------------------------

  const verified =
    cachedMarketNewsSchema.parse(result);

  // --------------------------------
  // 5. CACHE FOR FIVE MINUTES
  // --------------------------------

  signal?.throwIfAborted();

  await cacheSet(
    cacheKey,
    JSON.stringify(verified),
    NEWS_CACHE_TTL_SECONDS
  );

  signal?.throwIfAborted();

  // --------------------------------
  // 6. RETURN VERIFIED NEWS
  // --------------------------------

  return verified;
}
