import fs from "node:fs/promises";
import path from "node:path";

import {
  generateSignedKycAgreement,
} from "./modules/kyc/kycAgreement.service.js";

async function test() {
  try {
    const signaturePath = path.join(
      process.cwd(),
      "documents",
      "kyc",
      "test-signature.png",
    );

    const signatureBuffer =
      await fs.readFile(signaturePath);

    const signatureBase64 =
      `data:image/png;base64,${signatureBuffer.toString("base64")}`;

    const result =
      await generateSignedKycAgreement({
        customerId:
          "00000000-0000-0000-0000-000000000001",

        customerName:
          "Test Customer",

        signatureBase64,

        signedAt:
          new Date(),
      });

    console.log(
      "Signed PDF generated successfully"
    );

    console.log(
      "Document path:",
      result.documentPath
    );

    console.log(
      "SHA-256:",
      result.documentHash
    );
  } catch (error) {
    console.error(
      "Failed to generate signed PDF:",
      error
    );

    process.exit(1);
  }
}

void test();