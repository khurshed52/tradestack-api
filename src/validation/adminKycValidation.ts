import { z } from "zod";

export const reviewKycSchema = z.object({
  decision: z.enum([
    "APPROVED",
    "REJECTED",
  ]),
});

export type ReviewKycInput = z.infer<
  typeof reviewKycSchema
>;