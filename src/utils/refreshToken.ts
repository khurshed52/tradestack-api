import crypto from "node:crypto";

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(32).toString("base64url");
};

export const hashRefreshToken = (
  token: string
): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};