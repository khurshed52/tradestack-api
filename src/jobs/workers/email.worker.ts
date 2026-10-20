
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
  sendPasswordChangedEmail,
  sendKycReminderEmail,
} from "../handlers/welcomeEmail.handler.js";

type EmailJobName =
  | "welcome-email"
  | "password-changed-email"
  | "kyc-reminder-email";

export const emailWorker = new Worker<
  EmailJobData,
  void,
  EmailJobName
>(
  "tradestack-emails",

  async (job) => {
    const { userId, outboxEventId } = job.data;

    if (
      ![
        "welcome-email",
        "password-changed-email",
        "kyc-reminder-email",
      ].includes(job.name) ||
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
      event.type !== job.name
    ) {
      throw new Error(
        "Email outbox event validation failed"
      );
    }

    // Validate the business event for each email type.
    if (job.name === "welcome-email") {
      if (
        event.eventKey !== `auth:welcome:${userId}`
      ) {
        throw new Error(
          "Invalid welcome email event"
        );
      }
    } else if (
      job.name === "password-changed-email"
    ) {
      const prefix = "auth:password-changed:";

      if (!event.eventKey.startsWith(prefix)) {
        throw new Error(
          "Invalid password email event"
        );
      }

      const otpId =
        event.eventKey.slice(prefix.length);

      const resetOtp =
        await prisma.passwordResetOtp.findFirst({
          where: {
            id: otpId,
            userId,
            usedAt: { not: null },
            verifiedAt: { not: null },
          },
          select: {
            id: true,
          },
        });

      if (!resetOtp) {
        throw new Error(
          "Password reset event validation failed"
        );
      }
    } else if (
      job.name === "kyc-reminder-email"
    ) {
      if (
        event.eventKey !==
        `kyc:reminder:${userId}`
      ) {
        throw new Error(
          "Invalid KYC reminder event"
        );
      }
    }

    // Avoid processing already sent emails.
    if (event.status === "SENT") {
      console.log(
        `[Email Worker] Event already SENT: ${event.id}`
      );
      return;
    }

    // Atomically claim this event.
    const claim =
      await claimEmailOutboxEvent(event.id);

    if (!claim) {
      const latest =
        await prisma.emailOutbox.findUnique({
          where: {
            id: event.id,
          },
          select: {
            status: true,
          },
        });

      if (latest?.status === "SENT") {
        console.log(
          `[Email Worker] Already sent: ${event.id}`
        );
        return;
      }

      throw new Error(
        `Email event ${event.id} cannot be claimed; status: ${latest?.status ?? "NOT_FOUND"}`
      );
    }

    try {
      if (job.name === "welcome-email") {
        await sendWelcomeEmail({
          userId: event.userId,
        });
      } else if (
        job.name === "password-changed-email"
      ) {
        await sendPasswordChangedEmail({
          userId: event.userId,
        });
      } else if (
        job.name === "kyc-reminder-email"
      ) {
        const sent = await sendKycReminderEmail({
          userId: event.userId,
        });

        if (!sent) {
          // Customer is no longer eligible.
          // Do not mark an unsent email as SENT.
          //
          // Keep the event instead of deleting the
          // audit record. FAILED indicates the
          // reminder was not delivered; lastError
          // explains why it was skipped.
          const updated =
            await prisma.emailOutbox.updateMany({
              where: {
                id: claim.eventId,
                status: "PROCESSING",
                claimToken: claim.claimToken,
              },
              data: {
                status: "FAILED",
                lastError:
                  "KYC reminder skipped: customer no longer eligible",
                lockedUntil: null,
                claimToken: null,
              },
            });

          if (updated.count !== 1) {
            throw new Error(
              "Unable to record skipped KYC reminder"
            );
          }

          console.log(
            `[Email Worker] KYC reminder skipped: ${event.id}`
          );

          return;
        }
      }

      const marked =
        await markEmailOutboxSent(claim);

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
        const recorded =
          await markEmailOutboxFailed(
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
