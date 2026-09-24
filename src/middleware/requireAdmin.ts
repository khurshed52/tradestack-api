import type {
  Request,
  Response,
  NextFunction,
} from "express";

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({
      statusCode: 401,
      message: "Authentication required",
      data: null,
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      statusCode: 403,
      message: "Admin access required",
      data: null,
    });
  }

  next();
};