
import { timingSafeEqual } from "node:crypto";

import { coinPaymentsConfig } from "../../../config/coinpayments.js";

import { generateCoinPaymentsSignature } from "./coinpayments.signature.js";

type VerifyWebhookInput = {
  url: string;
  clientId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
};

export function verifyCoinPaymentsWebhookSignature(
  input: VerifyWebhookInput
): boolean {
  const {
    url,
    clientId,
    timestamp,
    signature,
    rawBody,
  } = input;

  if (
    !clientId ||
    !timestamp ||
    !signature ||
    !coinPaymentsConfig.clientId ||
    !coinPaymentsConfig.clientSecret
  ) {
    return false;
  }

  if (clientId !== coinPaymentsConfig.clientId) {
    return false;
  }

  // CoinPayments timestamps have no timezone suffix.
  const validTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp);

  if (!validTimestamp) {
    return false;
  }

  const timestampMs = Date.parse(`${timestamp}Z`);

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
  ) {
    return false;
  }

  const expectedSignature = generateCoinPaymentsSignature({
    method: "POST",
    url,
    clientId,
    clientSecret: coinPaymentsConfig.clientSecret,
    timestamp,
    payload: rawBody.toString("utf8"),
  });

  // Validate canonical Base64 before comparing.
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(signature)
  ) {
    return false;
  }

  const expected = Buffer.from(expectedSignature, "base64");
  const received = Buffer.from(signature, "base64");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
