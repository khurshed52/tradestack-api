
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
