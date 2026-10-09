import { claimKycTransition, KycLifecycleConflictError } from "./kycLifecycle.js";
import type {
  Request,
  Response,
} from "express";

import crypto from "node:crypto";

import prisma from "../../db/db.config.js";

type VeriffDecisionPayload = {
  status?: string;

  verification?: {
    id?: string;
    status?: string;
    code?: number;
    vendorData?: string | null;
    reason?: string | null;
    reasonCode?: number | string | null;
  };
};

export const veriffWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const secret =
      process.env.VERIFF_SHARED_SECRET;

    const apiKey =
      process.env.VERIFF_API_KEY;

    // --------------------------------------------------
    // CONFIGURATION CHECK
    // --------------------------------------------------

    if (!secret || !apiKey) {
      console.error(
        "Veriff webhook credentials missing"
      );

      return res.status(500).json({
        statusCode: 500,
        message:
          "Webhook configuration error",
        data: null,
      });
    }

    // --------------------------------------------------
    // RAW BODY CHECK
    // --------------------------------------------------
    //
    // express.raw() must be used for this endpoint
    // because Veriff signs the exact raw request body.
    // --------------------------------------------------

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Invalid webhook body",
        data: null,
      });
    }

    const rawBody = req.body;

    const receivedSignature =
      req.header("x-hmac-signature");

    const receivedApiKey =
      req.header("x-auth-client");

    // --------------------------------------------------
    // AUTHENTICATION HEADERS
    // --------------------------------------------------

    if (
      !receivedSignature ||
      !receivedApiKey
    ) {
      return res.status(401).json({
        statusCode: 401,
        message:
          "Invalid webhook authentication",
        data: null,
      });
    }

    // --------------------------------------------------
    // VERIFY API KEY
    // --------------------------------------------------

    if (receivedApiKey !== apiKey) {
      return res.status(401).json({
        statusCode: 401,
        message:
          "Invalid webhook authentication",
        data: null,
      });
    }

    // --------------------------------------------------
    // VERIFY HMAC SIGNATURE
    // --------------------------------------------------

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(rawBody)
        .digest("hex");

    /*
     * Validate hexadecimal input before converting it.
     *
     * A SHA-256 hex digest must contain exactly
     * 64 hexadecimal characters.
     */
    if (
      !/^[a-fA-F0-9]{64}$/.test(
        receivedSignature
      )
    ) {
      return res.status(401).json({
        statusCode: 401,
        message:
          "Invalid webhook signature",
        data: null,
      });
    }

    const receivedBuffer =
      Buffer.from(
        receivedSignature,
        "hex"
      );

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "hex"
      );

    if (
      receivedBuffer.length !==
        expectedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      return res.status(401).json({
        statusCode: 401,
        message:
          "Invalid webhook signature",
        data: null,
      });
    }

    // --------------------------------------------------
    // PARSE PAYLOAD
    // --------------------------------------------------

    let payload:
      VeriffDecisionPayload;

    try {
      payload = JSON.parse(
        rawBody.toString("utf8")
      ) as VeriffDecisionPayload;
    } catch {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Invalid webhook JSON",
        data: null,
      });
    }

    const verification =
      payload.verification;

    if (!verification?.id) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Verification ID missing",
        data: null,
      });
    }

    const sessionId =
      verification.id;

    const decision =
      verification.status;

    // --------------------------------------------------
    // FIND KYC PROFILE
    // --------------------------------------------------
    //
    // providerSessionId identifies the KYC profile.
    // customerId lets us update Customer.status.
    // --------------------------------------------------

    const kycProfile =
      await prisma.kycProfile.findUnique({
        where: {
          providerSessionId:
            sessionId,
        },

        select: {
          id: true,
          customerId: true,
        },
      });

    if (!kycProfile) {
      console.warn(
        `Veriff webhook received for unknown session: ${sessionId}`
      );

      /*
       * Return 200 so Veriff does not repeatedly
       * retry a valid webhook that cannot be
       * associated with a local KYC profile.
       */
      return res.status(200).json({
        statusCode: 200,
        message:
          "Webhook received",
        data: null,
      });
    }

    // --------------------------------------------------
    // PROCESS VERIFF DECISION
    // --------------------------------------------------

    const nextStatus = decision === "approved" ? "IDENTITY_VERIFIED"
      : ["declined", "expired", "abandoned"].includes(decision ?? "") ? "IDENTITY_REJECTED"
      : ["review", "resubmission_requested"].includes(decision ?? "") ? "IDENTITY_IN_PROGRESS"
      : null;

    if (nextStatus) {
      try {
        await prisma.$transaction(async (tx) => {
          await claimKycTransition(tx, kycProfile.customerId, "IDENTITY_IN_PROGRESS", nextStatus);
          // Recheck after claiming the customer row: a retry may have replaced
          // this session since the initial lookup. Throw to roll back the claim.
          const currentProfile = await tx.kycProfile.findUnique({
            where: { id: kycProfile.id },
            select: { providerSessionId: true },
          });
          if (currentProfile?.providerSessionId !== sessionId) {
            throw new KycLifecycleConflictError();
          }
          if (nextStatus !== "IDENTITY_IN_PROGRESS") {
            await tx.kycProfile.update({
              where: { id: kycProfile.id },
              data: { identityVerifiedAt: nextStatus === "IDENTITY_VERIFIED" ? new Date() : null },
            });
          }
        });
      } catch (error) {
        // Stale or duplicate callbacks are acknowledged without mutation.
        if (!(error instanceof KycLifecycleConflictError)) throw error;
      }
    } else {
      console.warn(`Unhandled Veriff decision: ${decision}`);
    }

    console.log(
      `Veriff webhook processed: ${sessionId} → ${decision}`
    );

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      statusCode: 200,
      message:
        "Webhook received",
      data: null,
    });
  } catch (error) {
    console.error(
      "Veriff webhook error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message:
        "Webhook processing failed",
      data: null,
    });
  }
};