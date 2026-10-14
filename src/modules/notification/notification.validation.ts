import { z } from "zod";

export const notificationListSchema = z.object({
  page: z.number().int().min(1).default(1),

  pageSize: z.number().int().min(1).max(100).default(10),

  unreadOnly: z.boolean().default(false),
});

export const notificationIdSchema = z.object({
  id: z.uuid("Invalid notification ID"),
});