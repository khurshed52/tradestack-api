import { rateLimit } from "express-rate-limit";

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per IP per 15 minutes

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (_req, res) => {
    return res.status(429).json({
      statusCode: 429,
      message: "Too many requests. Please try again later.",
      data: null,
    });
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (_req, res) => {
    return res.status(429).json({
      statusCode: 429,
      message: "Too many login attempts. Please try again later.",
      data: null,
    });
  },
});