
import prisma from "../../db/db.config.js";
import { emailQueue } from "../queues/email.queue.js";

export type RecoveryIssue =
  | "EXPIRED_CLAIM"
  | "FAILED_DELIVERY"
  | "MISSING_QUEUE_JOB"
  | "FAILED_QUEUE_JOB"
  | "INCONSISTENT_QUEUE_STATE";

export interface EmailRecoveryItem {
  eventId: string;
  eventKey: string;
  status: string;
  issue: RecoveryIssue;
  jobState: string | null;
  attempts: number;
  lastError: string | null;
}

export const inspectEmailOutboxRecovery =
  async (): Promise<EmailRecoveryItem[]> => {
    const now = new Date();

    const events = await prisma.emailOutbox.findMany({
      where: {
        OR: [
          { status: "PENDING" },
          { status: "FAILED" },
          {
            status: "PROCESSING",
            lockedUntil: {
              lt: now,
            },
          },
          {
            status: "PROCESSING",
            lockedUntil: null,
          },
        ],
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: 100,
    });

    const issues: EmailRecoveryItem[] = [];

    for (const event of events) {
      let issue: RecoveryIssue | null = null;
      let jobState: string | null = null;

      if (event.status === "PROCESSING") {
        issue = "EXPIRED_CLAIM";
      } else if (event.status === "FAILED") {
        issue = "FAILED_DELIVERY";
      } else if (event.status === "PENDING") {
        const jobId = `email-${event.id}`;

        const job = await emailQueue.getJob(jobId);

        if (!job) {
          issue = "MISSING_QUEUE_JOB";
        } else {
          jobState = await job.getState();

          if (jobState === "failed") {
            issue = "FAILED_QUEUE_JOB";
          } else if (
            jobState === "completed" ||
            jobState === "unknown"
          ) {
            issue = "INCONSISTENT_QUEUE_STATE";
          }
        }
      }

      if (!issue) {
        continue;
      }

      issues.push({
        eventId: event.id,
        eventKey: event.eventKey,
        status: event.status,
        issue,
        jobState,
        attempts: event.attempts,
        lastError: event.lastError,
      });
    }

    return issues;
  };
