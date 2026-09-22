import type {
  Request,
  Response,
  NextFunction,
} from "express";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled error:", error);

  return res.status(500).json({
    statusCode: 500,
    message: "Internal server error",
    data: null,
  });
};