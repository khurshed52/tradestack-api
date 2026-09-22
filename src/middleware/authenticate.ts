import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { verifyAccessToken } from "../utils/jwt.js";

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

    // Store authenticated user information
    req.user = {
      id: payload.sub!,
      role: payload.role as string,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};