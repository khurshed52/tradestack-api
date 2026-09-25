import { Router } from "express";

import { requireAdmin } from "../../middleware/requireAdmin.js";
import { validateBody } from "../../middleware/validate.js";

import { reviewKyc } from "./adminKyc.controller.js";
import { reviewKycSchema } from "./adminKyc.validation.js";

const router = Router();

router.patch(
  "/kyc/:customerId/decision",
  requireAdmin,
  validateBody(reviewKycSchema),
  reviewKyc,
);

export default router;