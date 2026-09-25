import { z } from "zod";

const MAX_SIGNATURE_BASE64_LENGTH = 2_000_000;

export const signKycAgreementSchema = z.object({
  accepted: z.literal(true, {
    error: "You must accept the Terms and Conditions",
  }),

  documentVersion: z
    .string()
    .trim()
    .min(1, "Document version is required")
    .refine(
      (value) => value === "terms-v1",
      "Invalid document version",
    ),

  signature: z
    .string()
    .min(1, "Signature is required")
    .max(
      MAX_SIGNATURE_BASE64_LENGTH,
      "Signature image is too large",
    )
    .refine(
      (value) =>
        /^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          value,
        ) && value.length > "data:image/png;base64,".length,
      "Signature must be a valid PNG base64 image",
    ),
});

export type SignKycAgreementInput = z.infer<
  typeof signKycAgreementSchema
>;