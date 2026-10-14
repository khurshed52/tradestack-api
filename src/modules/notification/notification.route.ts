import { Router } from "express";

import {
  getUnreadNotificationCount,
  getNotificationsController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
} from "./notification.controller.js";

const notificationRouter = Router();

// Get unread notification count
notificationRouter.get(
  "/unread-count",
  getUnreadNotificationCount,
);

// Get paginated notifications
notificationRouter.post(
  "/list",
  getNotificationsController,
);

// Mark all notifications as read
notificationRouter.patch(
  "/read-all",
  markAllNotificationsAsReadController,
);

// Mark a single notification as read
notificationRouter.patch(
  "/:id/read",
  markNotificationAsReadController,
);

export default notificationRouter;