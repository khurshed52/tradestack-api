import { z } from "zod";

import {
  emailSchema,
  nonEmptyString,
} from "../../validation/commonValidation.js";

/*
 * Login only needs a non-empty password.
 *
 * Do not enforce the current password policy during login,
 * because existing users may have passwords created under
 * an older policy.
 */
const loginPasswordSchema = z
  .string()
  .min(1, "Password is required");

/*
 * Password policy for new passwords.
 *
 * Requirements:
 * - 8 to 30 characters
 * - at least 1 uppercase letter
 * - at least 1 lowercase letter
 * - at least 1 number
 * - at least 1 symbol
 */
const passwordSchema = z
  .string()
  .min(
    8,
    "Password must be at least 8 characters",
  )
  .max(
    30,
    "Password must be at most 30 characters",
  )
  .regex(
    /[A-Z]/,
    "Password must contain at least one uppercase letter",
  )
  .regex(
    /[a-z]/,
    "Password must contain at least one lowercase letter",
  )
  .regex(
    /[0-9]/,
    "Password must contain at least one number",
  )
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one symbol",
  );

export const loginSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .passthrough();

export const registerSchema = z
  .object({
    customerFirstName: nonEmptyString,
    customerLastName: nonEmptyString,
    email: emailSchema,

    password: passwordSchema,

    customerNationality: nonEmptyString,
    phoneNumber: nonEmptyString,

    reglink: z.string().nullish(),

    consentAccepted: z.literal(true, {
      error:
        "Privacy Policy and Terms consent is required",
    }),
  })
  .passthrough();

export const emailOnlySchema = z
  .object({
    email: emailSchema,
  })
  .passthrough();

export const verifyResetOtpSchema = z
  .object({
    email: emailSchema,

    // Keep strings and numbers supported.
    // OTP matching and failed-attempt accounting
    // remain in the controller.
    otp: z.union([
      z.string().min(1),
      z
        .number()
        .refine((value) => value !== 0),
    ]),
  })
  .passthrough();

export const resetPasswordSchema = z
  .object({
    resetToken: nonEmptyString,
    newPassword: passwordSchema,
  })
  .passthrough();

  export const verifyRegistrationOtpSchema = z
  .object({
    email: emailSchema,

    otp: z.union([
      z.string().regex(
        /^\d{6}$/,
        "OTP must be a 6-digit code",
      ),

      z
        .number()
        .int()
        .min(100000)
        .max(999999),
    ]),
  })
  .passthrough();