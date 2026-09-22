import { z } from "zod";

// Check trimmed content without changing values; controllers own normalization.
export const nonEmptyString = z.string().refine(
  (value) => value.trim().length > 0,
  "Must be a non-empty string"
);

export const emailSchema = z.string().trim().email("Invalid email address");

// Match the UUID format accepted by the existing customer controllers.
export const customerIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "A valid customer UUID is required"
);
