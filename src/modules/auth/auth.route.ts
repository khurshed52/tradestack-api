import { Router } from "express";
import { register, login, refreshAccessToken, logout, forgotPassword, verifyResetOtp, resetPassword, resendResetOtp } from "./auth.controller.js";
import { loginRateLimiter } from "../../middleware/rateLimiter.js";
import { validateBody } from "../../middleware/validate.js";
import { loginSchema, registerSchema, emailOnlySchema, verifyResetOtpSchema, resetPasswordSchema } from "./auth.validation.js";
const router = Router();

router.post("/register", validateBody(registerSchema), register);
router.post("/login", loginRateLimiter, validateBody(loginSchema), login);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.post("/forgot-password", validateBody(emailOnlySchema), forgotPassword);
router.post("/verify-reset-otp", validateBody(verifyResetOtpSchema), verifyResetOtp);
router.post("/reset-password", validateBody(resetPasswordSchema), resetPassword);
router.post("/resend-reset-otp", validateBody(emailOnlySchema), resendResetOtp);
export default router;