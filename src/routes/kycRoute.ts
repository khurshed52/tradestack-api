import { Router } from "express";
import { getMyKycProfile , updateMyKycProfile, startIdentityVerification, signKycAgreement} from "../controller/KycController.js";
import { updateKycProfileSchema } from "../validation/kycValidation.js";
import { validateBody } from "../middleware/validate.js";
import { signKycAgreementSchema} from "../validation/kycSignatureValidation.js";
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