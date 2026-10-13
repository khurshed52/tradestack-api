import { createHmac } from "node:crypto";

type SignatureInput = {
  method: string;
  url: string;
  clientId: string;
  clientSecret: string;
  timestamp: string;
  payload?: string;
};

export function generateCoinPaymentsSignature({
  method,
  url,
  clientId,
  clientSecret,
  timestamp,
  payload = "",
}: SignatureInput): string {
  const message =
    "\uFEFF" +
    method.toUpperCase() +
    url +
    clientId +
    timestamp +
    payload;

  return createHmac("sha256", clientSecret)
    .update(message, "utf8")
    .digest("base64");
}