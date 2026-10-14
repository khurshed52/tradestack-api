
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { verifyAccessToken } from "../utils/jwt.js";
import prisma from "../db/db.config.js";
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    // Authorization header missing or incorrect
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Remove "Bearer " and get only JWT
    const token = authHeader.slice(7);

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // Verify signature, expiration, issuer and audience
    const payload = await verifyAccessToken(token);

    // Session ID is present in newly issued access tokens
    const sessionId =
      typeof payload.sid === "string"
        ? payload.sid
        : undefined;

    if (sessionId) {
      // Verify that the session belongs to the JWT user
      // and has not been revoked or expired.
      const session = await prisma.userSession.findUnique({
        where: {
          id: sessionId,
        },
        select: {
          userId: true,
          revokedAt: true,
          expiresAt: true,
        },
      });

      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt !== null ||
        session.expiresAt <= new Date()
      ) {
        return res.status(401).json({
          message: "Invalid or expired token",
        });
      }
    }

    // Store authenticated user information
    req.user = {
      id: payload.sub!,
      role: payload.role as string,
      sessionId,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};
