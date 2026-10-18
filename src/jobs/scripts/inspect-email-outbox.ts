
import { inspectEmailOutboxRecovery } from
  "../services/emailOutbox.recovery.js";

import { emailQueue } from
  "../queues/email.queue.js";

import prisma from "../../db/db.config.js";

const main = async (): Promise<void> => {
  try {
    const issues =
      await inspectEmailOutboxRecovery();

    console.log(
      `[Email Outbox] Found ${issues.length} items requiring review`
    );

    for (const item of issues) {
      console.log({
        eventId: item.eventId,
        issue: item.issue,
        status: item.status,
        jobState: item.jobState,
        attempts: item.attempts,
        lastError: item.lastError,
      });
    }
  } catch (error) {
    console.error(
      "[Email Outbox] Inspection failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    await Promise.allSettled([
      emailQueue.close(),
      prisma.$disconnect(),
    ]);
  }
};

void main();
