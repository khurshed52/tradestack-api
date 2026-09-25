import fs from "node:fs/promises";
import path from "node:path";

import { sendEmail } from "../../services/emailService.js";
import { renderEmailTemplate } from "../../utils/emailTemplate.js";

interface SendKycCompletedEmailParams {
  email: string;
  customerName: string;
  documentPath: string;
}

export const sendKycCompletedEmail = async ({
  email,
  customerName,
  documentPath,
}: SendKycCompletedEmailParams) => {
  const html = await renderEmailTemplate(
    "kyc/kyc-completed",
    {
      name: customerName,
      supportUrl:
        process.env.SUPPORT_URL ?? "https://example.com/support",
    },
  );

  // documentPath is expected to be the relative path stored
  // in KycAgreement, for example:
  // storage/kyc/signed/<filename>.pdf
  const absoluteDocumentPath = path.resolve(
    process.cwd(),
    documentPath,
  );

  const pdf = await fs.readFile(absoluteDocumentPath);

  await sendEmail(
    email,
    "KYC verification completed",
    html,
    [
      {
        content: pdf.toString("base64"),
        filename: "signed-terms-and-conditions.pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  );
};