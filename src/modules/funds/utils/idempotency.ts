import { createHash } from "node:crypto";

// ======================================================
// CREATE IDEMPOTENCY REQUEST HASH
// ======================================================

export const createIdempotencyRequestHash = (
  data: Record<string, unknown>
): string => {
  /*
   * Object keys are sorted so the same logical
   * request produces the same hash even if the
   * property order is different.
   */

  const normalizedData =
    Object.keys(data)
      .sort()
      .reduce<Record<string, unknown>>(
        (result, key) => {
          result[key] = data[key];

          return result;
        },
        {}
      );

  const serialized =
    JSON.stringify(normalizedData);

  return createHash("sha256")
    .update(serialized)
    .digest("hex");
};