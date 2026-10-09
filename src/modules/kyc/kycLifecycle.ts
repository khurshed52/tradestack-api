import type { Prisma, KycStatus } from "../../generated/prisma/client.js";

export class KycLifecycleConflictError extends Error {
  constructor() {
    super("KYC status changed or this operation is not allowed");
  }
}

// Claim the customer row first in every lifecycle transaction. PostgreSQL
// rechecks the expected status after waiting for a concurrent writer.
export const claimKycTransition = async (
  tx: Prisma.TransactionClient,
  customerId: string,
  expected: KycStatus,
  next: KycStatus,
) => {
  const result = await tx.customer.updateMany({
    where: { id: customerId, status: expected },
    data: { status: next },
  });
  if (result.count !== 1) {
    throw new KycLifecycleConflictError();
  }
};
