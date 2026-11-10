
import type {
  FunctionDeclaration,
} from "@google/genai";

import { z } from "zod";

import {
  getMyKycProfileData,
} from "../../kyc/kyc-status.service.js";

// --------------------------------
// TOOL ARGUMENT VALIDATION
// --------------------------------

export const myKycStatusArgsSchema = z
  .object({})
  .strict();

// --------------------------------
// GEMINI TOOL DECLARATION
// --------------------------------

export const kycTools: FunctionDeclaration[] = [
  {
    name: "get_my_kyc_status",

    description:
      "Get the authenticated customer's current " +
      "TradePro KYC verification status, profile " +
      "completion, identity verification progress, " +
      "and general next steps. Read-only. " +
      "Use when a customer asks whether they are " +
      "verified, their KYC progress, or what " +
      "verification step remains.",

    parametersJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

// --------------------------------
// SAFE NEXT-STEP MAPPING
// --------------------------------

function getKycNextStep(status: string): string {
  switch (status) {
    case "REGISTERED":
      return "Complete your KYC profile.";

    case "PROFILE_COMPLETED":
      return "Start identity verification.";

    case "IDENTITY_IN_PROGRESS":
      return "Wait for the identity verification result.";

    case "IDENTITY_REJECTED":
      return (
        "Your identity verification was rejected. " +
        "You may be able to retry identity verification."
      );

    case "IDENTITY_VERIFIED":
      return "Review and sign the KYC agreement.";

    case "COMPLETED":
      return (
        "Your KYC profile and agreement steps " +
        "are completed. Check the platform for " +
        "any remaining review or approval."
      );

    case "APPROVED":
      return "Your KYC has been approved.";

    case "REJECTED":
      return (
        "Your KYC was rejected. Contact TradePro " +
        "support for the applicable next steps."
      );

    default:
      return (
        "Check your verification page for " +
        "the next available action."
      );
  }
}

// --------------------------------
// EXECUTE KYC STATUS TOOL
// --------------------------------

export async function executeMyKycStatus(
  _args: z.infer<typeof myKycStatusArgsSchema>,
  userId: string
) {
  if (!userId) {
    throw new Error("AI_AUTH_REQUIRED");
  }

  const customer =
    await getMyKycProfileData(userId);

  if (!customer) {
    return {
      status: "CUSTOMER_PROFILE_NOT_FOUND",
      customerExists: false,
      profileExists: false,
      kycProfileExists: false,
      profileCompleted: false,
      identityVerified: false,
      agreementStepCompleted: false,
      nextStep:
        "No customer profile is linked to your login. " +
        "Please complete customer registration or contact support.",
      rejectionReason: null,
    };
  }

  const status = customer.status;
  const profile = customer.kycProfile;

  return {
    status,

    // A Customer exists before its optional KycProfile is submitted.
    // Do not describe an unstarted KYC profile as an unlinked login.
    customerExists: true,
    profileExists: true,
    kycProfileExists: profile !== null,

    profileCompleted:
      profile?.profileCompletedAt != null,

    identityVerified:
      profile?.identityVerifiedAt != null,

    agreementStepCompleted:
      profile?.completedAt != null,

    nextStep: getKycNextStep(status),

    // Do not invent rejection reasons.
    rejectionReason: null,

    // This tool never sends personal KYC data
    // or identity documents to Gemini.
  };
}
