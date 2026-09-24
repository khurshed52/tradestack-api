import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

interface GenerateSignedAgreementInput {
  customerId: string;
  customerName: string;
  signatureBase64: string;
  signedAt: Date;
}

interface GenerateSignedAgreementResult {
  documentPath: string;
  documentHash: string;
}

const DOCUMENT_VERSION = "terms-v1";

export class InvalidSignatureError extends Error {
  constructor() {
    super("Signature must be a valid PNG image");
    this.name = "InvalidSignatureError";
  }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function decodePngSignature(value: unknown): Buffer {
  const prefix = "data:image/png;base64,";
  if (process.env.KYC_SIGNATURE_DEBUG === "true") {
    console.log("[KYC SIGN] signature data URL type:",
      typeof value === "string" && value.startsWith(prefix) ? "image/png" : "invalid");
  }

  if (typeof value !== "string" || value.length > 2_000_000 || !value.startsWith(prefix)) {
    throw new InvalidSignatureError();
  }

  const payload = value.slice(prefix.length);
  // Buffer.from is permissive: enforce complete base64 groups and padding first.
  if (!payload || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw new InvalidSignatureError();
  }

  const buffer = Buffer.from(payload, "base64");
  if (process.env.KYC_SIGNATURE_DEBUG === "true") {
    console.log("[KYC SIGN] decoded signature bytes:", buffer.length);
    console.log("[KYC SIGN] first 8 bytes:", buffer.subarray(0, 8).toString("hex"));
  }

  if (
    buffer.length <= PNG_SIGNATURE.length ||
    buffer.length > 1_500_000 ||
    buffer.toString("base64") !== payload ||
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    throw new InvalidSignatureError();
  }

  return buffer;
}

export async function generateSignedKycAgreement(
  input: GenerateSignedAgreementInput,
): Promise<GenerateSignedAgreementResult> {
  const {
    customerId,
    customerName,
    signatureBase64,
    signedAt,
  } = input;

  const signatureBytes = decodePngSignature(signatureBase64);

  const projectRoot = process.cwd();

  // Original master PDF
  const templatePath = path.join(
    projectRoot,
    "documents",
    "kyc",
    `${DOCUMENT_VERSION}.pdf`,
  );

  // Signed PDF directory
  const outputDirectory = path.join(
    projectRoot,
    "storage",
    "kyc",
    "signed",
  );

  await fs.mkdir(outputDirectory, { recursive: true });

  // Load original PDF
  const templateBytes = await fs.readFile(templatePath);

  const pdfDoc = await PDFDocument.load(templateBytes);

  // Embed PNG signature
  const signatureImage = await pdfDoc.embedPng(signatureBytes);

  const pages = pdfDoc.getPages();

  if (!pages.length) {
    throw new Error("Terms PDF contains no pages");
  }

  // We sign the last page
  const page = pages[pages.length - 1];

  const { width } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /*
   * --------------------------------------------------
   * SIGNATURE POSITION
   * --------------------------------------------------
   *
   * PDF coordinates start from bottom-left.
   *
   * Adjust these values to match your actual PDF.
   */

  const leftMargin = 60;
  const signatureY = 90;

  const maxSignatureWidth = 160;
  const maxSignatureHeight = 55;

  const originalDimensions = signatureImage.scale(1);

  const scale = Math.min(
    maxSignatureWidth / originalDimensions.width,
    maxSignatureHeight / originalDimensions.height,
    1,
  );

  const signatureWidth = originalDimensions.width * scale;
  const signatureHeight = originalDimensions.height * scale;

  // Customer name
  page.drawText(`Signed by: ${customerName}`, {
    x: leftMargin,
    y: signatureY + 75,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  // Signature
  page.drawImage(signatureImage, {
    x: leftMargin,
    y: signatureY,
    width: signatureWidth,
    height: signatureHeight,
  });

  // Server-generated timestamp
  page.drawText(`Signed at: ${signedAt.toISOString()}`, {
    x: leftMargin,
    y: signatureY - 18,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });

  // Internal customer reference
  page.drawText(`Customer reference: ${customerId}`, {
    x: leftMargin,
    y: signatureY - 34,
    size: 8,
    font,
    color: rgb(0, 0, 0),
  });

  /*
   * Save final PDF
   */

  const signedPdfBytes = await pdfDoc.save();

  // SHA-256 of EXACT final PDF bytes
  const documentHash = crypto
    .createHash("sha256")
    .update(signedPdfBytes)
    .digest("hex");

  /*
   * Don't use customer email/name in filename.
   * customerId is sufficient.
   */
  const filename = `${customerId}-${Date.now()}.pdf`;

  const outputPath = path.join(
    outputDirectory,
    filename,
  );

  await fs.writeFile(
    outputPath,
    signedPdfBytes,
  );

  // Store relative path in DB later rather than machine-specific absolute path.
  const relativePath = path.relative(
    projectRoot,
    outputPath,
  );

  return {
    documentPath: relativePath,
    documentHash,
  };
}

export { DOCUMENT_VERSION };