import { Router } from "express";

import { requireAdmin } from "../middleware/requireAdmin.js";
import { validateBody } from "../middleware/validate.js";

import { reviewKyc } from "../controller/AdminKycController.js";
import { reviewKycSchema } from "../validation/adminKycValidation.js";

const router = Router();

router.patch(
  "/kyc/:customerId/decision",
  requireAdmin,
  validateBody(reviewKycSchema),
  reviewKyc,
);

export default router;