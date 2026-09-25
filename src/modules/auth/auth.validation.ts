import { z } from "zod";
import { emailSchema, nonEmptyString } from "../../validation/commonValidation.js";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = z.object({
  customerFirstName: nonEmptyString,
  customerLastName: nonEmptyString,
  email: emailSchema,
  password: passwordSchema,
  customerNationality: nonEmptyString,
  phoneNumber: nonEmptyString,
  reglink: z.string().nullish(),
}).passthrough();

export const emailOnlySchema = z.object({ email: emailSchema }).passthrough();

export const verifyResetOtpSchema = z.object({
  email: emailSchema,
  // Keep strings and numbers supported. OTP matching and failed-attempt
  // accounting remain in the controller, including wrong-length codes.
  otp: z.union([z.string().min(1), z.number().refine((value) => value !== 0)]),
}).passthrough();

export const resetPasswordSchema = z.object({
  resetToken: nonEmptyString,
  newPassword: passwordSchema,
}).passthrough();
