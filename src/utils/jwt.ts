import { SignJWT, jwtVerify } from "jose";

const getSecret = () => {
  const value = process.env.JWT_ACCESS_SECRET;

  if (!value) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return new TextEncoder().encode(value);
};

const issuer =
  process.env.JWT_ISSUER ?? "backend-starter";

const audience =
  process.env.JWT_AUDIENCE ?? "backend-starter-web";

export const createAccessToken = async (
  userId: string,
  role: string
) => {
  return new SignJWT({
    role,
    type: "access",
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
};

export const verifyAccessToken = async (
  token: string
) => {
  const { payload } = await jwtVerify(
    token,
    getSecret(),
    {
      issuer,
      audience,
    }
  );

  if (
    payload.type !== "access" ||
    !payload.sub
  ) {
    throw new Error("Invalid access token");
  }

  return payload;
};