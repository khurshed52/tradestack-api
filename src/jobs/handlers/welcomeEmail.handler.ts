
import prisma from "../../db/db.config.js";
import { sendEmail } from "../../services/emailService.js";
import { renderEmailTemplate } from "../../utils/emailTemplate.js";

export interface WelcomeEmailData {
  userId: string;
}

export const sendWelcomeEmail = async (
  data: WelcomeEmailData
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: {
      id: data.userId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
    },
  });

  if (!user) {
    throw new Error(
      `Welcome email user not found: ${data.userId}`
    );
  }

  if (!user.isActive) {
    throw new Error(
      "Cannot send welcome email to inactive user"
    );
  }

  const safeName = (user.name ?? "Customer")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const html = await renderEmailTemplate(
    "auth/welcome",
    {
      name: safeName,
      supportUrl: "#",
      year: new Date().getFullYear(),
    }
  );

  await sendEmail(
    user.email,
    "Welcome to TradePro",
    html
  );

  console.log(
    `[Email Worker] Welcome email accepted by SendGrid for user ${user.id}`
  );
};


export const sendPasswordChangedEmail = async ({
  userId,
}: {
  userId: string;
}): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
    },
  });

  if (!user) {
    throw new Error(
      `Password notification user not found: ${userId}`
    );
  }

  const safeName = (user.name ?? "User")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const html = await renderEmailTemplate(
    "auth/password-changed",
    {
      name: safeName,
      supportUrl: "#",
      year: new Date().getFullYear(),
    }
  );

  await sendEmail(
    user.email,
    "Your TradePro Password Has Been Changed",
    html
  );

  console.log(
    `[Email Worker] Password changed notification accepted by SendGrid for user ${userId}`
  );
};



export const sendKycReminderEmail = async ({
  userId,
}: {
  userId: string;
}): Promise<boolean> => {
  const customer = await prisma.customer.findUnique({
    where: { userId },
    select: {
      email: true,
      customerFirstName: true,
      isActive: true,
      status: true,
    },
  });

  if (!customer || !customer.isActive) {
    return false;
  }

  const messages: Record<string, string> = {
    REGISTERED:
      "Please complete your personal profile to begin KYC verification.",

    PROFILE_IN_PROGRESS:
      "Please finish your personal profile to continue KYC verification.",

    PROFILE_COMPLETED:
      "Please continue with your identity verification.",

    IDENTITY_PENDING:
      "Please complete your identity verification.",

    IDENTITY_IN_PROGRESS:
      "Please finish your identity verification.",

    IDENTITY_VERIFIED:
      "Please sign your KYC agreement to complete onboarding.",

    SIGNATURE_PENDING:
      "Please sign your KYC agreement to complete onboarding.",
  };

  const message = messages[customer.status];

  // No reminder after KYC completion, approval or rejection.
  if (!message) {
    return false;
  }

  const safe = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const html = await renderEmailTemplate(
    "kyc/kyc-reminder",
    {
      name: safe(customer.customerFirstName),
      message: safe(message),
      year: new Date().getFullYear(),
    }
  );

  await sendEmail(
    customer.email,
    "Reminder: Complete Your TradePro KYC",
    html
  );

  console.log(
    `[Email Worker] KYC reminder accepted by SendGrid for user ${userId}`
  );

  return true;
};

