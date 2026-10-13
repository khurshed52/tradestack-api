
import prisma from "../../../db/db.config.js";

export async function findCoinPaymentsPaymentAttempt(
  invoiceId: string
) {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      invoiceId
    )
  ) {
    return null;
  }

  return prisma.paymentAttempt.findUnique({
    where: {
      provider_providerReference: {
        provider: "COINPAYMENTS",
        providerReference: invoiceId,
      },
    },
    include: {
      fundTransaction: true,
    },
  });
}
