import { Router } from "express";
import { getMyKycProfile , updateMyKycProfile, startIdentityVerification, signKycAgreement} from "./kyc.controller.js";
import { updateKycProfileSchema } from "./kyc.validation.js";
import { validateBody } from "../../middleware/validate.js";
import { signKycAgreementSchema} from "./kycSignature.validation.js";
const router = Router();

router.get("/profile", getMyKycProfile);
router.patch(
  "/profile",
  validateBody(updateKycProfileSchema), updateMyKycProfile);

  router.post(
  "/identity/session",
  startIdentityVerification
);

router.post(
  "/agreement/sign",
  validateBody(signKycAgreementSchema),
  signKycAgreement,
);

export default router;