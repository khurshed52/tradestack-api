
import type { Prisma } from "../../generated/prisma/client.js";

export interface CreateEmailOutboxInput {
  eventKey: string;
  type: string;
  userId: string;
}

export const createEmailOutboxEvent = async (
  tx: Prisma.TransactionClient,
  input: CreateEmailOutboxInput
) => {
  return tx.emailOutbox.upsert({
    where: {
      eventKey: input.eventKey,
    },

    create: {
      eventKey: input.eventKey,
      type: input.type,
      userId: input.userId,
      status: "PENDING",
    },

    update: {},
  });
};
