import crypto from "node:crypto";

const getOtpHashSecret = (): string => {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET is not configured");
  }

  return secret;
};

export const generateOtp = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOtp = (otp: string): string => {
  return crypto
    .createHmac("sha256", getOtpHashSecret())
    .update(otp)
    .digest("hex");
};