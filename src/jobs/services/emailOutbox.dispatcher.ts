
import prisma from "../../db/db.config.js";
import { emailQueue } from "../queues/email.queue.js";

// ======================================================
// CONFIGURATION — LOCAL TEST ONLY
// ======================================================

// 2 minutes for local testing.
// IMPORTANT: Restore 48 hours before production.
const KYC_REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;

// Scan every 30 seconds.
// Production recommendation: 10 minutes.
const KYC_REMINDER_SCAN_MS = 10 * 60 * 1000;

// ======================================================
// EMAIL OUTBOX CURSOR
// ======================================================

let lastScanned: {
  createdAt: Date;
  id: string;
} | null = null;

// ======================================================
// GET PENDING EMAIL OUTBOX EVENTS
// ======================================================

export const getPendingEmailOutboxEvents = async () => {
  const findEvents = async () =>
    prisma.emailOutbox.findMany({
      where: {
        status: "PENDING",
        type: {
          in: [
            "welcome-email",
            "password-changed-email",
            "kyc-reminder-email",
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

// ======================================================
// CREATE DUE KYC REMINDER EVENTS
// ======================================================

let lastKycReminderScan = 0;

const createDueKycReminderEvents =
  async (): Promise<void> => {
    const now = Date.now();

    if (
      now - lastKycReminderScan <
      KYC_REMINDER_SCAN_MS
    ) {
      return;
    }

    const cutoff = new Date(
      now - KYC_REMINDER_DELAY_MS
    );

    console.log("[KYC Reminder] Scanning", {
      cutoff: cutoff.toISOString(),
    });

    // REGISTERED / PROFILE_IN_PROGRESS:
    // Reminder based on original registration date.
    //
    // Other incomplete KYC stages:
    // Reminder based on Step 1 completion date.
    //
    // Completed/approved/rejected customers
    // are excluded.
    //
    // NOT EXISTS prevents duplicate reminder events.

    const customers = await prisma.$queryRaw<
      Array<{ userId: string }>
    >`
      SELECT c."userId"
      FROM "Customer" c
      LEFT JOIN "KycProfile" p
        ON p."customerId" = c."id"
      WHERE c."isActive" = true
        AND c."status"::text IN (
          'REGISTERED',
          'PROFILE_IN_PROGRESS',
          'PROFILE_COMPLETED',
          'IDENTITY_PENDING',
          'IDENTITY_IN_PROGRESS',
          'IDENTITY_VERIFIED',
          'SIGNATURE_PENDING'
        )
        AND (
          CASE
            WHEN c."status"::text IN (
              'REGISTERED',
              'PROFILE_IN_PROGRESS'
            )
            THEN c."createdAt"
            ELSE p."profileCompletedAt"
          END
        ) <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM "EmailOutbox" e
          WHERE e."userId" = c."userId"
            AND e."type" = 'kyc-reminder-email'
        )
      ORDER BY c."createdAt" ASC
      LIMIT 50
    `;

    console.log(
      `[KYC Reminder] Eligible customers: ${customers.length}`
    );

    for (const customer of customers) {
      await prisma.emailOutbox.upsert({
        where: {
          eventKey: `kyc:reminder:${customer.userId}`,
        },
        create: {
          eventKey: `kyc:reminder:${customer.userId}`,
          type: "kyc-reminder-email",
          userId: customer.userId,
          status: "PENDING",
        },
        update: {},
      });

      console.log(
        `[KYC Reminder] Event created for ${customer.userId}`
      );
    }

    // Update only after successful processing.
    lastKycReminderScan = now;
  };

// ======================================================
// DISPATCH EMAIL EVENTS TO BULLMQ
// ======================================================

export const dispatchPendingEmailEvents =
  async (): Promise<void> => {
    await createDueKycReminderEvents();

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
