import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";

const decimalSchema = (signed = false) => z.union([z.string(), z.number()]).refine(
  (value) => (signed ? /^-?\d{1,10}(\.\d{1,8})?$/ : /^\d{1,18}(\.\d{1,10})?$/).test(String(value)),
  `Must be a ${signed ? "" : "non-negative "}decimal value within supported precision`
);

export const saveCryptoSchema = z.object({
  symbol: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9/_-]{1,29}$/,
    "symbol must contain 2–30 letters, digits, /, _, or -"
  ),
  buyPrice: decimalSchema().nullish(),
  spread: decimalSchema().nullish(),
  price: decimalSchema(),
  changePercent: decimalSchema(true),
  high: decimalSchema(),
  low: decimalSchema(),
}).passthrough().superRefine((body, ctx) => {
  // Only compare parsed decimal fields; invalid strings must never reach Decimal.
  const decimal = decimalSchema();
  if (![body.price, body.high, body.low].every((value) => decimal.safeParse(value).success)) return;
  const price = new Prisma.Decimal(body.price);
  const high = new Prisma.Decimal(body.high);
  const low = new Prisma.Decimal(body.low);
  if (high.lessThan(low) || price.lessThan(low) || price.greaterThan(high)) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "price must be between low and high" });
  }
});
