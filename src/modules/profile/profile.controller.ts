import type { Request, Response } from "express";
import prisma from "../../db/db.config.js";

// ----------------------------------------------------
// WITHDRAWAL SECURITY COOLDOWN
// ----------------------------------------------------

const WITHDRAWAL_PASSWORD_COOLDOWN_MS =
  24 * 60 * 60 * 1000;

export const getMyProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    // ----------------------------------------------------
    // FIND USER
    // ----------------------------------------------------

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,

        passwordChangedAt: true,

        createdAt: true,
        updatedAt: true,

        customer: {
          select: {
            id: true,
            sid: true,

            // Customer lifecycle / onboarding status
            status: true,

            customerFirstName: true,
            customerLastName: true,
            customerNationality: true,
            phoneNumber: true,

            isActive: true,

            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // ----------------------------------------------------
    // USER NOT FOUND
    // ----------------------------------------------------

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found",
        data: null,
      });
    }

    // ----------------------------------------------------
    // CUSTOMER / ONBOARDING STATUS
    // ----------------------------------------------------

    /*
     * Customer.status is now the source of truth
     * for the customer's onboarding lifecycle.
     *
     * A user without a Customer record falls back
     * to REGISTERED for the frontend bootstrap.
     */
    const status =
      user.customer?.status ??
      "REGISTERED";

    // ----------------------------------------------------
    // WITHDRAWAL SECURITY
    // ----------------------------------------------------

    let withdrawalAllowed = true;
    let withdrawalAllowedAt: Date | null =
      null;

    if (user.passwordChangedAt) {
      withdrawalAllowedAt = new Date(
        user.passwordChangedAt.getTime() +
          WITHDRAWAL_PASSWORD_COOLDOWN_MS
      );

      withdrawalAllowed =
        Date.now() >=
        withdrawalAllowedAt.getTime();

      /*
       * Once the cooldown has expired there is no
       * active restriction.
       */
      if (withdrawalAllowed) {
        withdrawalAllowedAt = null;
      }
    }

    // ----------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------

    return res.status(200).json({
      statusCode: 200,
      message: "Profile fetched successfully",

      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,

        // --------------------------------
        // CUSTOMER ONBOARDING STATUS
        // --------------------------------

        status,

        // --------------------------------
        // FRONTEND PERMISSIONS
        // --------------------------------

        permissions: {
          withdrawalAllowed,
        },

        // --------------------------------
        // ACTIVE RESTRICTIONS
        // --------------------------------

        restrictions: {
          withdrawalAllowedAt,
        },

        createdAt: user.createdAt,
        updatedAt: user.updatedAt,

        customer: user.customer
          ? {
              id: user.customer.id,
              sid: user.customer.sid,

              customerFirstName:
                user.customer
                  .customerFirstName,

              customerLastName:
                user.customer
                  .customerLastName,

              customerNationality:
                user.customer
                  .customerNationality,

              phoneNumber:
                user.customer.phoneNumber,

              isActive:
                user.customer.isActive,

              createdAt:
                user.customer.createdAt,

              updatedAt:
                user.customer.updatedAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error(
      "Get profile error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};