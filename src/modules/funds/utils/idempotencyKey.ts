import type { Request } from "express";

// ======================================================
// GET IDEMPOTENCY KEY
// ======================================================

export const getIdempotencyKey = (
  req: Request
): string => {
  const rawKey =
    req.headers["idempotency-key"];

  // --------------------------------
  // HEADER REQUIRED
  // --------------------------------

  if (!rawKey) {
    throw new Error(
      "IDEMPOTENCY_KEY_REQUIRED"
    );
  }

  // Express/Node headers can theoretically
  // contain multiple values.
  if (Array.isArray(rawKey)) {
    throw new Error(
      "INVALID_IDEMPOTENCY_KEY"
    );
  }

  const key =
    rawKey.trim();

  // --------------------------------
  // EMPTY KEY
  // --------------------------------

  if (!key) {
    throw new Error(
      "INVALID_IDEMPOTENCY_KEY"
    );
  }

  // --------------------------------
  // LENGTH PROTECTION
  // --------------------------------

  if (
    key.length < 16 ||
    key.length > 255
  ) {
    throw new Error(
      "INVALID_IDEMPOTENCY_KEY"
    );
  }

  return key;
};