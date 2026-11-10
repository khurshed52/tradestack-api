
import prisma from "../../db/db.config.js";

/**
 * Read-only KYC profile lookup.
 *
 * This function is shared by:
 * - GET /kyc/profile
 * - TradePro AI get_my_kyc_status
 *
 * The authenticated user ID must come from
 * trusted backend authentication context.
 */
export async function getMyKycProfileData(
  userId: string
) {
  if (!userId) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  return prisma.customer.findUnique({
    where: {
      userId,
    },

    select: {
      id: true,

      // Customer.status is the source of truth.
      status: true,

      customerFirstName: true,
      customerLastName: true,
      email: true,
      customerNationality: true,
      phoneNumber: true,

      kycProfile: {
        select: {
          dateOfBirth: true,
          gender: true,

          countryOfResidence: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,

          employmentStatus: true,
          occupation: true,

          profileCompletedAt: true,
          identityVerifiedAt: true,
          completedAt: true,
        },
      },
    },
  });
}
