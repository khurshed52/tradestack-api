import { coinPaymentsConfig } from "../../../config/coinpayments.js";
import { generateCoinPaymentsSignature } from "./coinpayments.signature.js";

type HttpMethod = "GET" | "POST";

export async function coinPaymentsRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  const {
    clientId,
    clientSecret,
    apiUrl,
  } = coinPaymentsConfig;

  if (!clientId || !clientSecret) {
    throw new Error("COINPAYMENTS_CREDENTIALS_MISSING");
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("COINPAYMENTS_INVALID_PATH");
  }

  // CoinPayments requires UTC ISO-8601 without
  // milliseconds or the trailing Z.
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "");

  const url = `${apiUrl.replace(/\/$/, "")}${path}`;

  // Sign exactly the same JSON string that we send.
  const payload =
    body === undefined ? "" : JSON.stringify(body);

  const signature = generateCoinPaymentsSignature({
    method,
    url,
    clientId,
    clientSecret,
    timestamp,
    payload,
  });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CoinPayments-Client": clientId,
      "X-CoinPayments-Timestamp": timestamp,
      "X-CoinPayments-Signature": signature,
    },
    ...(body !== undefined ? { body: payload } : {}),
    signal: AbortSignal.timeout(15000),
  });

  const responseText = await response.text();

if (!response.ok) {
  console.error("CoinPayments API error", {
    status: response.status,
    details: responseText.slice(0, 2000),
  });

  throw new Error(
    `COINPAYMENTS_API_ERROR_${response.status}`
  );
}

  if (!responseText) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
}