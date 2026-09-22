import "dotenv/config";
import { sendEmail } from "./services/emailService.js";

try {
  await sendEmail(
    "khurshedkhan@gmail.com",
    "SendGrid Test",
    `
      <div>
        <h2>SendGrid is working 🎉</h2>
        <p>This is a test email from my Express backend.</p>
      </div>
    `
  );

  console.log("Email sent successfully");
} catch (error: any) {
  console.error(
    "Status:",
    error?.response?.statusCode
  );

  console.error(
    "SendGrid error:",
    JSON.stringify(
      error?.response?.body,
      null,
      2
    )
  );
}