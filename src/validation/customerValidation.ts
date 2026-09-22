import { z } from "zod";
import { customerIdSchema, emailSchema, nonEmptyString } from "./commonValidation.js";

const customerFields = {
  customerFirstName: nonEmptyString,
  customerLastName: nonEmptyString,
  email: emailSchema,
  customerNationality: nonEmptyString,
  phoneNumber: nonEmptyString,
};

export const customerDetailsSchema = z.object({ id: customerIdSchema }).passthrough();

export const updateCustomerSchema = z.object(customerFields).partial().extend({
  id: customerIdSchema,
}).strict().refine(
  (body) => Object.keys(customerFields).some((key) => Object.hasOwn(body, key)),
  "Provide at least one field to update"
);

export const listCustomersSchema = z.preprocess(
  (body) => body ?? {},
  z.object({
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    // Filters are substring searches, including email; empty strings are allowed.
    filters: z.object({
      customerFirstName: z.string().optional(),
      customerLastName: z.string().optional(),
      email: z.string().optional(),
      customerNationality: z.string().optional(),
      phoneNumber: z.string().optional(),
    }).strict().optional(),
  }).passthrough().refine(
    ({ page = 1, pageSize = 10 }) => Number.isSafeInteger((page - 1) * pageSize),
    { path: ["page"], message: "Pagination offset must be a safe integer" }
  )
);
