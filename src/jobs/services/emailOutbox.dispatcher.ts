
import prisma from "../../db/db.config.js";
import { emailQueue } from "../queues/email.queue.js";

let lastScanned: {
  createdAt: Date;
  id: string;
} | null = null;

export const getPendingEmailOutboxEvents = async () => {
  const findEvents = async () =>
    prisma.emailOutbox.findMany({
      where: {
        status: "PENDING",
        type: {
          in: [
            "welcome-email",
            "password-changed-email",
          ],
        },
        ...(lastScanned
          ? {
              OR: [
                {
                  createdAt: {
                    gt: lastScanned.createdAt,
                  },
                },
                {
                  createdAt: lastScanned.createdAt,
                  id: {
                    gt: lastScanned.id,
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        eventKey: true,
        type: true,
        userId: true,
        createdAt: true,
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: 20,
    });

  let events = await findEvents();

  if (events.length === 0 && lastScanned) {
    lastScanned = null;
    events = await findEvents();
  }

  return events;
};

export const dispatchPendingEmailEvents =
  async (): Promise<void> => {
    const events =
      await getPendingEmailOutboxEvents();

    for (const event of events) {
      await emailQueue.add(
        event.type,
        {
          userId: event.userId,
          outboxEventId: event.id,
        },
        {
          jobId: `email-${event.id}`,
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        }
      );

      lastScanned = {
        createdAt: event.createdAt,
        id: event.id,
      };

      console.log(
        `[Email Outbox] Enqueue requested: ${event.eventKey}`
      );
    }
  };
