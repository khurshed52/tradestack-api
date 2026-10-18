
import { Worker } from "bullmq";

import prisma from "../../db/db.config.js";

import {
  getEmailRedisConnection,
} from "../../config/bullmq.config.js";

import type {
  EmailJobData,
} from "../queues/email.queue.js";

import {
  claimEmailOutboxEvent,
  markEmailOutboxSent,
  markEmailOutboxFailed,
} from "../services/emailOutbox.processor.js";

import {
  sendWelcomeEmail,
} from "../handlers/welcomeEmail.handler.js";

export const emailWorker = new Worker<
  EmailJobData,
  void,
  "welcome-email"
>(
  "tradestack-emails",

  async (job) => {
    const { userId, outboxEventId } = job.data;

    if (
      job.name !== "welcome-email" ||
      !userId ||
      !outboxEventId ||
      job.id !== `email-${outboxEventId}`
    ) {
      throw new Error(
        "Invalid or unsupported email job"
      );
    }

    const event = await prisma.emailOutbox.findUnique({
      where: {
        id: outboxEventId,
      },
    });

    if (
      !event ||
      event.userId !== userId ||
      event.type !== job.name ||
      event.eventKey !== `auth:welcome:${userId}`
    ) {
      throw new Error(
        "Email outbox event validation failed"
      );
    }

    if (event.status === "SENT") {
      console.log(
        `[Email Worker] Event already SENT: ${event.id}`
      );
      return;
    }

    const claim = await claimEmailOutboxEvent(
      event.id
    );

    if (!claim) {
      const latest = await prisma.emailOutbox.findUnique({
        where: { id: event.id },
        select: { status: true },
      });

      if (latest?.status === "SENT") {
        console.log(`[Email Worker] Already sent: ${event.id}`);
        return;
      }

      throw new Error(
        `Email event ${event.id} cannot be claimed; status: ${latest?.status ?? "NOT_FOUND"}`
      );
    }

    try {
      await sendWelcomeEmail({
        userId: event.userId,
      });

      const marked = await markEmailOutboxSent(
        claim
      );

      if (!marked) {
        throw new Error(
          "Email accepted but SENT update failed"
        );
      }

      console.log(
        `[Email Worker] Email marked SENT: ${event.id}`
      );
    } catch (error) {
      try {
        const recorded = await markEmailOutboxFailed(
          claim,
          error
        );

        if (!recorded) {
          console.error(
            "[Email Worker] Failed to record outbox failure"
          );
        }
      } catch (statusError) {
        console.error(
          "[Email Worker] Outbox status update error:",
          statusError
        );
      }

      throw error;
    }
  },

  {
    connection: getEmailRedisConnection(true),
    concurrency: 1,
    autorun: false,
  }
);

emailWorker.on("completed", (job) => {
  console.log(
    `[Email Worker] Job ${job.id} completed`
  );
});

emailWorker.on("failed", (job, error) => {
  console.error(
    `[Email Worker] Job ${job?.id} failed:`,
    error.message
  );
});

emailWorker.on("error", (error) => {
  console.error(
    "[Email Worker] Error:",
    error.message
  );
});
