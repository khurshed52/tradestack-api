import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export const validateBody =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        statusCode: 400,
        message: "Validation failed",
        data: result.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          // Do not echo client-supplied unknown property names.
          message: issue.code === "unrecognized_keys" ? "Unsupported fields" : issue.message,
        })),
      });
    }

    // Use Zod's parsed/sanitized values
    req.body = result.data;

    next();
  };