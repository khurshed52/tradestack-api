import type { Request, Response } from "express";
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
    const secret = process.env.VERIFF_SHARED_SECRET;
    const apiKey = process.env.VERIFF_API_KEY;

    if (!secret || !apiKey) {
      console.error("Veriff webhook credentials missing");

      return res.status(500).json({
        statusCode: 500,
        message: "Webhook configuration error",
        data: null,
      });
    }

    // Because express.raw() is used for this endpoint.
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid webhook body",
        data: null,
      });
    }

    const rawBody = req.body;

    const receivedSignature =
      req.header("x-hmac-signature");

    const receivedApiKey =
      req.header("x-auth-client");

    if (!receivedSignature || !receivedApiKey) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid webhook authentication",
        data: null,
      });
    }

    // Verify that webhook belongs to our Veriff integration.
    if (receivedApiKey !== apiKey) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid webhook authentication",
        data: null,
      });
    }

    // Veriff signs the RAW request body using HMAC-SHA256.
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const receivedBuffer =
      Buffer.from(receivedSignature, "hex");

    const expectedBuffer =
      Buffer.from(expectedSignature, "hex");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid webhook signature",
        data: null,
      });
    }

    let payload: VeriffDecisionPayload;

    try {
      payload = JSON.parse(
        rawBody.toString("utf8")
      ) as VeriffDecisionPayload;
    } catch {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid webhook JSON",
        data: null,
      });
    }

    const verification = payload.verification;

    if (!verification?.id) {
      return res.status(400).json({
        statusCode: 400,
        message: "Verification ID missing",
        data: null,
      });
    }

    const sessionId = verification.id;
    const decision = verification.status;

    const kycProfile =
      await prisma.kycProfile.findUnique({
        where: {
          providerSessionId: sessionId,
        },

        select: {
          id: true,
          status: true,
        },
      });

    if (!kycProfile) {
      console.warn(
        `Veriff webhook received for unknown session: ${sessionId}`
      );

      // Return 200 so Veriff doesn't repeatedly retry
      // an otherwise valid webhook we cannot associate.
      return res.status(200).json({
        statusCode: 200,
        message: "Webhook received",
        data: null,
      });
    }

    switch (decision) {
      case "approved":
        await prisma.kycProfile.update({
          where: {
            id: kycProfile.id,
          },

          data: {
            status: "IDENTITY_VERIFIED",
            identityVerifiedAt: new Date(),
          },
        });

        break;

      case "declined":
        await prisma.kycProfile.update({
          where: {
            id: kycProfile.id,
          },

          data: {
            status: "IDENTITY_REJECTED",
            identityVerifiedAt: null,
          },
        });

        break;

      case "resubmission_requested":
      case "review":
        // Verification isn't final yet.
        await prisma.kycProfile.update({
          where: {
            id: kycProfile.id,
          },

          data: {
            status: "IDENTITY_IN_PROGRESS",
          },
        });

        break;

      case "expired":
      case "abandoned":
        await prisma.kycProfile.update({
          where: {
            id: kycProfile.id,
          },

          data: {
            status: "IDENTITY_REJECTED",
            identityVerifiedAt: null,
          },
        });

        break;

      default:
        console.warn(
          `Unhandled Veriff decision: ${decision}`
        );
    }

    console.log(
      `Veriff webhook processed: ${sessionId} → ${decision}`
    );

    return res.status(200).json({
      statusCode: 200,
      message: "Webhook received",
      data: null,
    });
  } catch (error) {
    console.error(
      "Veriff webhook error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Webhook processing failed",
      data: null,
    });
  }
};