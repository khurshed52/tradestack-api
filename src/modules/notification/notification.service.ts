import prisma from "../../db/db.config.js";

export const getUnreadNotificationCountService = async (
  userId: string,
): Promise<number> => {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
};

export type GetNotificationsInput = {
  userId: string;
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
};

export const getNotificationsService = async ({
  userId,
  page = 1,
  pageSize = 10,
  unreadOnly = false,
}: GetNotificationsInput) => {
  const currentPage = Math.max(1, page);

  const currentPageSize = Math.min(
    Math.max(1, pageSize),
    100,
  );

  const skip = (currentPage - 1) * currentPageSize;

  const where = {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [dataCount, notifications] =
    await prisma.$transaction([
      prisma.notification.count({ where }),

      prisma.notification.findMany({
        where,
        skip,
        take: currentPageSize,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          isRead: true,
          readAt: true,
          actionUrl: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    page: currentPage,
    pageSize: currentPageSize,
    dataCount,
    pageCount: Math.ceil(dataCount / currentPageSize),
    pageData: notifications,
  };
};


export const markNotificationAsReadService = async (
  userId: string,
  notificationId: string,
) => {
  // UPDATE ONLY THE AUTHENTICATED USER'S NOTIFICATION
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  // RETURN THE NOTIFICATION ONLY IF IT BELONGS TO THIS USER
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      isRead: true,
      readAt: true,
      actionUrl: true,
      createdAt: true,
    },
  });

  if (!notification) {
    throw new Error("NOTIFICATION_NOT_FOUND");
  }

  return notification;
};

export const markAllNotificationsAsReadService = async (
  userId: string,
) => {
  // MARK ONLY THE AUTHENTICATED USER'S UNREAD NOTIFICATIONS
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return {
    updatedCount: result.count,
  };
};