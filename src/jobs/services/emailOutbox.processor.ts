
import { randomUUID } from "node:crypto";
import prisma from "../../db/db.config.js";

const CLAIM_DURATION_MS = 5 * 60 * 1000;

export interface EmailOutboxClaim {
  eventId: string;
  claimToken: string;
}

export const claimEmailOutboxEvent = async (
  eventId: string
): Promise<EmailOutboxClaim | null> => {
  const claimToken = randomUUID();

  const now = new Date();

  const lockedUntil = new Date(
    now.getTime() + CLAIM_DURATION_MS
  );

  const result = await prisma.emailOutbox.updateMany({
    where: {
      id: eventId,
      status: "PENDING",
      claimToken: null,
    },
    data: {
      status: "PROCESSING",
      claimToken,
      lockedUntil,
      processingStartedAt: now,
      attempts: {
        increment: 1,
      },
    },
  });

  if (result.count !== 1) {
    return null;
  }

  return {
    eventId,
    claimToken,
  };
};

export const markEmailOutboxSent = async (
  claim: EmailOutboxClaim
): Promise<boolean> => {
  const result = await prisma.emailOutbox.updateMany({
    where: {
      id: claim.eventId,
      status: "PROCESSING",
      claimToken: claim.claimToken,
    },
    data: {
      status: "SENT",
      sentAt: new Date(),
      lockedUntil: null,
      claimToken: null,
      lastError: null,
    },
  });

  return result.count === 1;
};

export const markEmailOutboxFailed = async (
  claim: EmailOutboxClaim,
  error: unknown
): Promise<boolean> => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Unknown email processing error";

  const result = await prisma.emailOutbox.updateMany({
    where: {
      id: claim.eventId,
      status: "PROCESSING",
      claimToken: claim.claimToken,
    },
    data: {
      status: "FAILED",
      lastError: errorMessage.slice(0, 1000),
      lockedUntil: null,
      claimToken: null,
    },
  });

  return result.count === 1;
};

export const getExpiredEmailOutboxClaims = async () => {
  return prisma.emailOutbox.findMany({
    where: {
      status: "PROCESSING",
      lockedUntil: {
        lt: new Date(),
      },
    },
    select: {
      id: true,
      eventKey: true,
      type: true,
      attempts: true,
      processingStartedAt: true,
      lockedUntil: true,
    },
    orderBy: {
      lockedUntil: "asc",
    },
    take: 50,
  });
};
