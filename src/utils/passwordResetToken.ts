import { SignJWT, jwtVerify } from "jose";

const getResetSecret = () => {
  const secret = process.env.PASSWORD_RESET_SECRET;

  if (!secret) {
    throw new Error(
      "PASSWORD_RESET_SECRET is not configured"
    );
  }

  return new TextEncoder().encode(secret);
};

export const createPasswordResetToken = async (
  userId: string,
  otpId: string
) => {
  return new SignJWT({
    type: "password-reset",
    otpId,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getResetSecret());
};

export const verifyPasswordResetToken = async (
  token: string
) => {
  const { payload } = await jwtVerify(
    token,
    getResetSecret()
  );

  if (
    payload.type !== "password-reset" ||
    !payload.sub ||
    typeof payload.otpId !== "string"
  ) {
    throw new Error("Invalid password reset token");
  }

  return payload;
};