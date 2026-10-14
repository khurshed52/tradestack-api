import type { Request, Response, NextFunction } from "express";
import { getNotificationsService, getUnreadNotificationCountService , markNotificationAsReadService, markAllNotificationsAsReadService} from "./notification.service.js";
import { notificationListSchema, notificationIdSchema } from "./notification.validation.js";

export const getUnreadNotificationCount = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // AUTHENTICATED USER
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    // GET UNREAD COUNT
    const unreadCount =
      await getUnreadNotificationCountService(userId);

    // RESPONSE
    return res.status(200).json({
      statusCode: 200,
      message: "Unread notification count retrieved successfully",
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getNotificationsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // AUTHENTICATED USER
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    // VALIDATE REQUEST BODY
    const validation = notificationListSchema.safeParse(
      req.body ?? {},
    );

    if (!validation.success) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid notification list request",
        data: null,
      });
    }

    const { page, pageSize, unreadOnly } = validation.data;

    // GET NOTIFICATIONS
    const result = await getNotificationsService({
      userId,
      page,
      pageSize,
      unreadOnly,
    });

    // RESPONSE
    return res.status(200).json({
      statusCode: 200,
      message: "Notifications retrieved successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

export const markNotificationAsReadController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // AUTHENTICATED USER
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    // VALIDATE NOTIFICATION ID
    const validation = notificationIdSchema.safeParse({
      id: req.params.id,
    });

    if (!validation.success) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid notification ID",
        data: null,
      });
    }

    // MARK AS READ
    const notification = await markNotificationAsReadService(
      userId,
      validation.data.id,
    );

    // RESPONSE
    return res.status(200).json({
      statusCode: 200,
      message: "Notification marked as read successfully",
      data: notification,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "NOTIFICATION_NOT_FOUND"
    ) {
      return res.status(404).json({
        statusCode: 404,
        message: "Notification not found",
        data: null,
      });
    }

    return next(error);
  }
};


export const markAllNotificationsAsReadController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // AUTHENTICATED USER
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication required",
        data: null,
      });
    }

    // MARK ALL AS READ
    const result =
      await markAllNotificationsAsReadService(userId);

    // RESPONSE
    return res.status(200).json({
      statusCode: 200,
      message: "All notifications marked as read successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};