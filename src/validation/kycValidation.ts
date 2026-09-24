import { z } from "zod";

export const updateKycProfileSchema = z
  .object({
    dateOfBirth: z
      .string()
      .date("Date of birth must be in YYYY-MM-DD format"),

    gender: z.enum([
      "MALE",
      "FEMALE",
      "OTHER",
    ]),

    countryOfResidence: z
      .string()
      .trim()
      .length(
        2,
        "Country of residence must be a 2-letter country code"
      )
      .transform((value) => value.toUpperCase()),

    addressLine1: z
      .string()
      .trim()
      .min(2, "Address is required")
      .max(200, "Address is too long"),

    addressLine2: z
      .string()
      .trim()
      .max(200, "Address is too long")
      .optional(),

    city: z
      .string()
      .trim()
      .min(2, "City is required")
      .max(100, "City is too long"),

    state: z
      .string()
      .trim()
      .min(2, "State is required")
      .max(100, "State is too long"),

    postalCode: z
      .string()
      .trim()
      .min(1, "Postal code is required")
      .max(20, "Postal code is too long"),

    employmentStatus: z.enum([
      "EMPLOYED",
      "SELF_EMPLOYED",
      "UNEMPLOYED",
      "STUDENT",
      "RETIRED",
    ]),

    occupation: z
      .string()
      .trim()
      .min(2, "Occupation is required")
      .max(100, "Occupation is too long"),
  })
  .strict();