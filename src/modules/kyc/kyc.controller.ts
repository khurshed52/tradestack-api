import type { Request, Response } from "express";
import prisma from "../../db/db.config.js";
import { createVeriffSession } from "./veriff.service.js";
import fs from "node:fs/promises";
import path from "node:path";
import {DOCUMENT_VERSION, generateSignedKycAgreement, InvalidSignatureError} from "./kycAgreement.service.js";
import { sendKycCompletedEmail } from "./kycCompletedEmail.service.js";
// ======================================================
// GET MY KYC PROFILE
// ======================================================

export const getMyKycProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
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
            status: true,
            profileCompletedAt: true,
            identityVerifiedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "KYC profile fetched successfully",
      data: customer,
    });
  } catch (error) {
    console.error(
      "Get KYC profile error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};


// ======================================================
// UPDATE / COMPLETE MY KYC PROFILE
// ======================================================

export const updateMyKycProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    // --------------------------------------------------
    // Find customer from authenticated user
    // --------------------------------------------------

    const customer =
      await prisma.customer.findUnique({
        where: {
          userId,
        },

        select: {
          id: true,
          isActive: true,
        },
      });

    if (!customer || !customer.isActive) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }


    // --------------------------------------------------
    // Validated body
    // --------------------------------------------------

    const {
      dateOfBirth,
      gender,
      countryOfResidence,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      employmentStatus,
      occupation,
    } = req.body;


    // --------------------------------------------------
    // Prepare KYC profile data
    // --------------------------------------------------

    const data = {
      dateOfBirth:
        new Date(`${dateOfBirth}T00:00:00.000Z`),

      gender,
      countryOfResidence,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      employmentStatus,
      occupation,
    };


    // --------------------------------------------------
    // CREATE OR UPDATE KYC PROFILE
    // --------------------------------------------------

    const kycProfile =
      await prisma.kycProfile.upsert({
        where: {
          customerId: customer.id,
        },

        create: {
          customerId: customer.id,
          ...data,

          status: "PROFILE_COMPLETED",
          profileCompletedAt: new Date(),
        },

        update: {
          ...data,

          status: "PROFILE_COMPLETED",
          profileCompletedAt: new Date(),
        },

        select: {
          id: true,
          customerId: true,

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

          status: true,
          profileCompletedAt: true,

          createdAt: true,
          updatedAt: true,
        },
      });


    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return res.status(200).json({
      statusCode: 200,
      message:
        "KYC profile completed successfully",
      data: kycProfile,
    });
  } catch (error) {
    console.error(
      "Update KYC profile error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

// ======================================================
// START IDENTITY VERIFICATION
// ======================================================

export const startIdentityVerification = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    // Get customer + their KYC profile
    const customer = await prisma.customer.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
        customerFirstName: true,
        customerLastName: true,
        isActive: true,

        kycProfile: {
          select: {
            id: true,
            status: true,
            providerSessionId: true,
          },
        },
      },
    });

    if (!customer || !customer.isActive) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    if (!customer.kycProfile) {
      return res.status(400).json({
        statusCode: 400,
        message: "Complete your KYC profile first",
        data: null,
      });
    }

    // Only allow identity verification after Step 1.
    if (
      customer.kycProfile.status !== "PROFILE_COMPLETED" &&
      customer.kycProfile.status !== "IDENTITY_PENDING"
    ) {
      return res.status(409).json({
        statusCode: 409,
        message: "Identity verification cannot be started",
        data: null,
      });
    }

    // Create Veriff TEST session
    const veriffSession = await createVeriffSession({
      customerId: customer.id,
      firstName: customer.customerFirstName,
      lastName: customer.customerLastName,
    });

    // Save Veriff session against this customer's KYC
    await prisma.kycProfile.update({
      where: {
        customerId: customer.id,
      },

      data: {
        identityProvider: "VERIFF",
        providerSessionId: veriffSession.sessionId,
        status: "IDENTITY_IN_PROGRESS",
      },
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Identity verification started successfully",
      data: {
        verificationUrl:
          veriffSession.verificationUrl,
      },
    });
  } catch (error) {
    console.error(
      "Start identity verification error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message:
        "Unable to start identity verification",
      data: null,
    });
  }
};

export const signKycAgreement = async (
  req: Request,
  res: Response,
) => {
  let generatedDocumentPath: string | null = null;

  /*
   * This becomes true only after the Prisma transaction
   * successfully commits.
   *
   * Important:
   * If email sending fails AFTER KYC completion, we must NOT
   * delete the signed PDF.
   */
  let kycCompleted = false;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Unauthorized",
        data: null,
      });
    }

    const {
      signature,
      accepted,
      documentVersion,
    } = req.body;

    /*
     * Validation middleware should already guarantee these,
     * but enforce important business rules here as well.
     */
    if (accepted !== true) {
      return res.status(400).json({
        statusCode: 400,
        message: "Terms and Conditions must be accepted",
        data: null,
      });
    }

    if (documentVersion !== DOCUMENT_VERSION) {
      return res.status(400).json({
        statusCode: 400,
        message: "Invalid document version",
        data: null,
      });
    }

    /*
     * Customer always comes from authenticated user.
     * Never accept customerId from frontend.
     */
    const customer = await prisma.customer.findUnique({
      where: {
        userId,
      },
      include: {
        kycProfile: true,
        kycAgreement: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        statusCode: 404,
        message: "Customer not found",
        data: null,
      });
    }

    if (!customer.kycProfile) {
      return res.status(400).json({
        statusCode: 400,
        message: "KYC profile not found",
        data: null,
      });
    }

    /*
     * Step 2 must be completed before Step 3.
     */
    if (
      customer.kycProfile.status !==
      "IDENTITY_VERIFIED"
    ) {
      return res.status(409).json({
        statusCode: 409,
        message:
          "Identity verification must be completed before signing",
        data: null,
      });
    }

    /*
     * Prevent duplicate agreements.
     */
    if (customer.kycAgreement) {
      return res.status(409).json({
        statusCode: 409,
        message: "KYC agreement has already been signed",
        data: null,
      });
    }

    const signedAt = new Date();

    const customerName =
      `${customer.customerFirstName} ${customer.customerLastName}`.trim();

    /*
     * Generate signed PDF.
     */
    const generated =
      await generateSignedKycAgreement({
        customerId: customer.id,
        customerName,
        signatureBase64: signature,
        signedAt,
      });

    generatedDocumentPath =
      generated.documentPath;

    /*
     * Audit information.
     */
    const ipAddress =
      req.ip || null;

    const userAgent =
      req.get("user-agent") || null;

    /*
     * Agreement creation and KYC completion must succeed
     * together.
     */
    const result = await prisma.$transaction(
      async (tx) => {
        const agreement =
          await tx.kycAgreement.create({
            data: {
              customerId:
                customer.id,

              documentVersion:
                DOCUMENT_VERSION,

              documentPath:
                generated.documentPath,

              documentHash:
                generated.documentHash,

              signedAt,

              ipAddress,

              userAgent,
            },
          });

        const kycProfile =
          await tx.kycProfile.update({
            where: {
              customerId:
                customer.id,
            },

            data: {
              status:
                "COMPLETED",

              completedAt:
                signedAt,
            },
          });

        return {
          agreement,
          kycProfile,
        };
      },
    );

    /*
     * The transaction has successfully committed.
     *
     * From this point onward we must NOT delete the signed
     * document if email delivery fails.
     */
    kycCompleted = true;

    /*
     * --------------------------------------------------
     * SEND KYC COMPLETION EMAIL
     * --------------------------------------------------
     *
     * Email failure must NOT change a successfully
     * completed KYC into an API failure.
     */
    try {
      await sendKycCompletedEmail({
        email:
          customer.email,

        customerName,

        documentPath:
          result.agreement.documentPath,
      });

      console.log(
        `[KYC] Completion email sent for customer ${customer.id}`,
      );
    } catch (emailError) {
      console.error(
        `[KYC] Failed to send completion email for customer ${customer.id}:`,
        emailError,
      );
    }

    /*
     * --------------------------------------------------
     * RESPONSE
     * --------------------------------------------------
     */

    return res.status(200).json({
      statusCode: 200,

      message:
        "KYC completed successfully",

      data: {
        status:
          result.kycProfile.status,

        completedAt:
          result.kycProfile.completedAt,

        agreement: {
          id:
            result.agreement.id,

          documentVersion:
            result.agreement.documentVersion,

          signedAt:
            result.agreement.signedAt,
        },
      },
    });
  } catch (error) {
    /*
     * Delete generated PDF ONLY when KYC did not complete.
     *
     * Example:
     *
     * PDF generated
     *       ↓
     * DB transaction fails
     *       ↓
     * Delete orphaned PDF
     *
     * Once the DB transaction commits, the document belongs
     * to the completed KYC and must remain stored.
     */
    if (
      generatedDocumentPath &&
      !kycCompleted
    ) {
      try {
        const absolutePath =
          path.resolve(
            process.cwd(),
            generatedDocumentPath,
          );

        await fs.unlink(
          absolutePath,
        );
      } catch (cleanupError) {
        console.error(
          "[KYC] Failed to clean up generated PDF:",
          cleanupError,
        );
      }
    }

    /*
     * Invalid signature is a client validation error.
     */
    if (
      error instanceof
      InvalidSignatureError
    ) {
      return res.status(400).json({
        statusCode: 400,

        message:
          "Signature must be a valid PNG image",

        data: null,
      });
    }

    console.error(
      "Sign KYC agreement error:",
      error,
    );

    return res.status(500).json({
      statusCode: 500,

      message:
        "Failed to sign KYC agreement",

      data: null,
    });
  }
};