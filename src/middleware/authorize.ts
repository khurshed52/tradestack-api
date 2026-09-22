import type { Request, Response, NextFunction } from "express";

export const authorize = (...allowedRoles: string[]) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        statusCode: 403,
        message: "You are not authorized to access this resource",
        data: null,
      });
    }

    next();
  };
};