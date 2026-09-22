import type { Request, Response } from "express";
import argon2 from "argon2";

import prisma from "../db/db.config.js";
import { createAccessToken } from "../utils/jwt.js";
import { generateRefreshToken,hashRefreshToken } from "../utils/refreshToken.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendEmail } from "../services/emailService.js";
import { createPasswordResetToken, verifyPasswordResetToken} from "../utils/passwordResetToken.js";
import { renderEmailTemplate } from "../utils/emailTemplate.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";
/**
 * Register User
 * POST /api/auth/register
 */
export const register = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      customerFirstName,
      customerLastName,
      email,
      password,
      customerNationality,
      phoneNumber,
      reglink,
    } = req.body;

    // Validate required fields
    if (
      typeof customerFirstName !== "string" ||
      !customerFirstName.trim() ||
      typeof customerLastName !== "string" ||
      !customerLastName.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password ||
      typeof customerNationality !== "string" ||
      !customerNationality.trim() ||
      typeof phoneNumber !== "string" ||
      !phoneNumber.trim()
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "All required fields must be provided",
        data: null,
      });
    }

    // Validate optional reglink
    if (
      reglink !== undefined &&
      reglink !== null &&
      typeof reglink !== "string"
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "reglink must be a string",
        data: null,
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        statusCode: 400,
        message: "Password must be at least 8 characters",
        data: null,
      });
    }

    // Normalize values
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = phoneNumber.trim();

    // Check whether email already exists
    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        statusCode: 409,
        message: "User already exists",
        data: null,
      });
    }

    // Check whether phone number already exists
    const existingCustomer =
      await prisma.customer.findUnique({
        where: {
          phoneNumber: normalizedPhoneNumber,
        },
      });

    if (existingCustomer) {
      return res.status(409).json({
        statusCode: 409,
        message: "Phone number already registered",
        data: null,
      });
    }

    // Hash password using Argon2id
    const passwordHash = await argon2.hash(
      password,
      {
        type: argon2.argon2id,
      }
    );

    // Create User + Customer together
    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,

            // Keep User.name for compatibility
            name: `${customerFirstName.trim()} ${customerLastName.trim()}`,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });

        const customer = await tx.customer.create({
          data: {
            userId: user.id,
            customerFirstName:
              customerFirstName.trim(),
            customerLastName:
              customerLastName.trim(),
            email: normalizedEmail,
            customerNationality:
              customerNationality.trim(),
            phoneNumber: normalizedPhoneNumber,
            reglink:
              typeof reglink === "string" &&
              reglink.trim()
                ? reglink.trim()
                : null,
          },
          select: {
            id: true,
            userId: true,
            customerFirstName: true,
            customerLastName: true,
            email: true,
            customerNationality: true,
            phoneNumber: true,
            reglink: true,
            isActive: true,
            createdAt: true,
          },
        });

        return {
          user,
          customer,
        };
      }
    );

    // The account is committed; email failure must not fail registration.
    try {
      const name = result.customer.customerFirstName
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

      const html = await renderEmailTemplate(
        "auth/welcome",
        {
          name,
          supportUrl: "#",
          year: new Date().getFullYear(),
        }
      );

      await sendEmail(
        result.user.email,
        "Welcome to TradePro",
        html
      );
    } catch (emailError) {
      console.error("Welcome email failed:", emailError);
    }

    return res.status(201).json({
      statusCode: 201,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

/**
 * Login User
 * POST /api/auth/login
 */
export const login = async (
  req: Request,
  res: Response
) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (typeof email !== "string" || !email.trim() || !password) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email and password are required",
        data: null,
      });
    }

    // Find user
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    // Don't reveal whether email exists
    if (!user) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid email or password",
        data: null,
      });
    }

    // Check account status
    if (!user.isActive) {
      return res.status(403).json({
        statusCode: 403,
        message: "Account is inactive",
        data: null,
      });
    }

    // Verify password
    const passwordValid = await argon2.verify(
      user.passwordHash,
      password
    );

    if (!passwordValid) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid email or password",
        data: null,
      });
    }

    // --------------------------------
    // ACCESS TOKEN
    // --------------------------------

    const accessToken = await createAccessToken(
      user.id,
      user.role
    );

    // --------------------------------
    // REFRESH TOKEN
    // --------------------------------

    // Generate random refresh token
    const refreshToken = generateRefreshToken();

    // Hash refresh token before saving to DB
    const refreshTokenHash =
      hashRefreshToken(refreshToken);

    // Refresh token expires after 7 days
    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 7
    );

    // Create login session in PostgreSQL
    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
      },
    });

    // --------------------------------
    // REFRESH TOKEN COOKIE
    // --------------------------------

    res.cookie(
      "refreshToken",
      refreshToken,
      {
        httpOnly: true,

        // false on localhost
        // true in production HTTPS
        secure:
          process.env.NODE_ENV === "production",

        sameSite: "lax",

        // 7 days
        maxAge:
          7 * 24 * 60 * 60 * 1000,
      }
    );

    // --------------------------------
    // RESPONSE
    // --------------------------------

    return res.status(200).json({
      statusCode: 200,
      message: "Login successful",

      data: {
        accessToken,

        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const refreshAccessToken = async (
  req: Request,
  res: Response
) => {
  try {
    // Get refresh token from HttpOnly cookie
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        statusCode: 401,
        message: "Refresh token is required",
        data: null,
      });
    }

    // Hash incoming token because DB stores only the hash
    const refreshTokenHash =
      hashRefreshToken(refreshToken);

    // Find matching session
    const session =
      await prisma.userSession.findUnique({
        where: {
          refreshTokenHash,
        },
        include: {
          user: true,
        },
      });

    // Session doesn't exist
    if (!session) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid refresh token",
        data: null,
      });
    }

    // Session was revoked
    if (session.revokedAt) {
      return res.status(401).json({
        statusCode: 401,
        message: "Session has been revoked",
        data: null,
      });
    }

    // Session expired
    if (session.expiresAt <= new Date()) {
      return res.status(401).json({
        statusCode: 401,
        message: "Refresh token has expired",
        data: null,
      });
    }

    // User account disabled
    if (!session.user.isActive) {
      return res.status(403).json({
        statusCode: 403,
        message: "Account is inactive",
        data: null,
      });
    }

    // Generate NEW short-lived access token
    const accessToken =
      await createAccessToken(
        session.user.id,
        session.user.role
      );

    // Update session usage
    await prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Access token refreshed successfully",
      data: {
        accessToken,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const logout = async (
  req: Request,
  res: Response
) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      const refreshTokenHash =
        hashRefreshToken(refreshToken);

      // Revoke the current session if it exists
      await prisma.userSession.updateMany({
        where: {
          refreshTokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    // Remove refresh token from browser/Postman
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res.status(200).json({
      statusCode: 200,
      message: "Logged out successfully",
      data: null,
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response
) => {
  try {
    const { email } = req.body;

    // Validate email
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email is required",
        data: null,
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Find user
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    // Account does not exist
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "Account does not exist",
        data: null,
      });
    }

    // Check latest OTP for 60-second cooldown
    const latestOtp = await prisma.passwordResetOtp.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (latestOtp) {
      const cooldownMs = 60 * 1000;

      const timePassed =
        Date.now() - latestOtp.createdAt.getTime();

      if (timePassed < cooldownMs) {
        const retryAfter = Math.ceil(
          (cooldownMs - timePassed) / 1000
        );

        return res.status(429).json({
          statusCode: 429,
          message: `Please wait ${retryAfter} seconds before requesting another OTP`,
          data: {
            retryAfter,
          },
        });
      }
    }

    // Generate 6-digit OTP
    const otp = generateOtp();

    // Hash OTP before storing it
    const otpHash = hashOtp(otp);

    // OTP expires after 10 minutes
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // Invalidate previous active OTPs
    await prisma.passwordResetOtp.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Store new OTP hash
    await prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
    });

    // Render OTP email template
    const html = await renderEmailTemplate(
      "auth/password-reset-otp",
      {
        name: user.name ?? "User",
        otp,
        expiresIn: 10,
        supportUrl: "#",
        year: new Date().getFullYear(),
      }
    );

    // Send OTP email
    await sendEmail(
      user.email,
      "Password Reset Verification",
      html
    );

    return res.status(200).json({
      statusCode: 200,
      message: "OTP has been sent successfully",
      data: null,
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const verifyResetOtp = async (
  req: Request,
  res: Response
) => {
  try {
    const { email, otp } = req.body;

    // Validate email and OTP
    if (
      typeof email !== "string" ||
      !email.trim() ||
      !otp
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email and OTP are required",
        data: null,
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Find user
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "Account does not exist",
        data: null,
      });
    }

    // Find latest active OTP
    const resetOtp =
      await prisma.passwordResetOtp.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          verifiedAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    if (!resetOtp) {
      return res.status(400).json({
        statusCode: 400,
        message: "No active OTP found",
        data: null,
      });
    }

    // Check OTP expiration
    if (resetOtp.expiresAt <= new Date()) {
      return res.status(400).json({
        statusCode: 400,
        message: "OTP has expired",
        data: null,
      });
    }

    // Maximum 5 failed attempts
    if (resetOtp.attempts >= 5) {
      return res.status(429).json({
        statusCode: 429,
        message: "Too many invalid OTP attempts",
        data: null,
      });
    }

    // Hash incoming OTP
    const incomingOtpHash = hashOtp(
      String(otp)
    );

    // Check OTP
    if (incomingOtpHash !== resetOtp.otpHash) {
      await prisma.passwordResetOtp.update({
        where: {
          id: resetOtp.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      return res.status(400).json({
        statusCode: 400,
        message: "Invalid OTP",
        data: null,
      });
    }

    // Mark OTP as verified
    await prisma.passwordResetOtp.update({
      where: {
        id: resetOtp.id,
      },
      data: {
        verifiedAt: new Date(),
      },
    });

    // Create temporary password reset token
    const resetToken =
      await createPasswordResetToken(
        user.id,
        resetOtp.id
      );

    return res.status(200).json({
      statusCode: 200,
      message: "OTP verified successfully",
      data: {
        resetToken,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response
) => {
  try {
    const { resetToken, newPassword } = req.body;

    // Validate input
    if (
      typeof resetToken !== "string" ||
      !resetToken.trim() ||
      typeof newPassword !== "string" ||
      !newPassword
    ) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Reset token and new password are required",
        data: null,
      });
    }

    // Validate password length
    if (newPassword.length < 8) {
      return res.status(400).json({
        statusCode: 400,
        message:
          "Password must be at least 8 characters",
        data: null,
      });
    }

    let payload;

    // Verify password reset token
    try {
      payload =
        await verifyPasswordResetToken(
          resetToken
        );
    } catch {
      return res.status(401).json({
        statusCode: 401,
        message:
          "Invalid or expired reset token",
        data: null,
      });
    }

    const userId = payload.sub!;
    const otpId = payload.otpId as string;

    // Find user for password update
    // and security notification email
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "Account does not exist",
        data: null,
      });
    }

    // Make sure the OTP connected to this token
    // is verified, unused and unexpired
    const resetOtp =
      await prisma.passwordResetOtp.findFirst({
        where: {
          id: otpId,
          userId: user.id,
          verifiedAt: {
            not: null,
          },
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

    if (!resetOtp) {
      return res.status(403).json({
        statusCode: 403,
        message:
          "Password reset request is invalid or has expired",
        data: null,
      });
    }

    // Hash new password
    const passwordHash = await argon2.hash(
      newPassword,
      {
        type: argon2.argon2id,
      }
    );

    const now = new Date();

    // Update password, consume OTP
    // and revoke existing sessions
    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          passwordHash,
        },
      }),

      prisma.passwordResetOtp.update({
        where: {
          id: resetOtp.id,
        },
        data: {
          usedAt: now,
        },
      }),

      prisma.userSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    // Clear refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    // Send password changed security notification
    // Email failure should NOT fail the password reset
    try {
      const html = await renderEmailTemplate(
        "auth/password-changed",
        {
          name: user.name ?? "User",
          supportUrl: "#",
          year: new Date().getFullYear(),
        }
      );

      await sendEmail(
        user.email,
        "Your TradePro Password Has Been Changed",
        html
      );
    } catch (emailError) {
      console.error(
        "Password changed notification email failed:",
        emailError
      );
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Password reset successfully",
      data: null,
    });
  } catch (error) {
    console.error(
      "Reset password error:",
      error
    );

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};

export const resendResetOtp = async (
  req: Request,
  res: Response
) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        statusCode: 400,
        message: "Email is required",
        data: null,
      });
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email);

    // Check user exists
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "Account does not exist",
        data: null,
      });
    }

    // Check latest OTP request
    const latestOtp =
      await prisma.passwordResetOtp.findFirst({
        where: {
          userId: user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    // 60-second cooldown
    if (latestOtp) {
      const cooldownMs = 60 * 1000;

      const timePassed =
        Date.now() - latestOtp.createdAt.getTime();

      if (timePassed < cooldownMs) {
        const retryAfter = Math.ceil(
          (cooldownMs - timePassed) / 1000
        );

        return res.status(429).json({
          statusCode: 429,
          message: `Please wait ${retryAfter} seconds before requesting another OTP`,
          data: {
            retryAfter,
          },
        });
      }
    }

    // Invalidate previous unused OTPs
    await prisma.passwordResetOtp.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Generate new OTP
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    // OTP expires after 10 minutes
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // Store new OTP hash
    await prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
    });

    // Render email template
    const html = await renderEmailTemplate(
      "auth/password-reset-otp",
      {
        name: user.name ?? "User",
        otp,
        expiresIn: 10,
        supportUrl: "#",
        year: new Date().getFullYear(),
      }
    );

    // Send new OTP
    await sendEmail(
      user.email,
      "Password Reset Verification",
      html
    );

    return res.status(200).json({
      statusCode: 200,
      message: "A new OTP has been sent successfully",
      data: null,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);

    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      data: null,
    });
  }
};
