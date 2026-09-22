import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;
const fromName =
  process.env.SENDGRID_FROM_NAME ?? "Trading App";

if (!apiKey) {
  throw new Error("SENDGRID_API_KEY is not configured");
}

if (!fromEmail) {
  throw new Error("SENDGRID_FROM_EMAIL is not configured");
}

sgMail.setApiKey(apiKey);

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  await sgMail.send({
    to,
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject,
    html,
  });
};