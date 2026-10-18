
import prisma from "../../db/db.config.js";
import { emailQueue } from "../queues/email.queue.js";

export const getPendingEmailOutboxEvents = async () => {
  return prisma.emailOutbox.findMany({
    where: {
      status: "PENDING",
      type: "welcome-email",
    },
    select: {
      id: true,
      eventKey: true,
      type: true,
      userId: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: 20,
  });
};

export const dispatchPendingEmailEvents =
  async (): Promise<void> => {
    const events =
      await getPendingEmailOutboxEvents();

    for (const event of events) {
      const jobId = `email-${event.id}`;

      await emailQueue.add(
        event.type,
        {
          userId: event.userId,
          outboxEventId: event.id,
        },
        {
          jobId,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        }
      );

      console.log(
        `[Email Outbox] Enqueue requested: ${event.eventKey}`
      );
    }
  };
