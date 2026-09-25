import { Router } from "express";
import customerRouter from "../modules/customer/customer.route.js";
import cryptoRouter from "../modules/market/crypto.route.js";
import paymentRouter from "../modules/payment/payment.route.js";
import authRoute from "../modules/auth/auth.route.js";
import profileRoute from "../modules/profile/profile.route.js";
import kycRoute from "../modules/kyc/kyc.route.js";
import adminRouter from "../modules/kyc/adminKyc.route.js";
import miscRoute from "../modules/misc/misc.route.js";
import accountRouter from "../modules/account/account.route.js";
import { authenticate } from "../middleware/authenticate.js";
import { apiRateLimiter } from "../middleware/rateLimiter.js";

const routes = Router();

// ==========================
// GENERAL RATE LIMIT
// ==========================

// Applies to everything mounted under /api
routes.use(apiRateLimiter);

// ==========================
// PUBLIC APIs
// ==========================

routes.use("/auth", authRoute);
routes.use("/misc", miscRoute);

// ==========================
// Everything below requires login
// ==========================

routes.use(authenticate);

// ==========================
// PROTECTED APIs
// ==========================

routes.use("/customer", customerRouter);
routes.use("/crypto", cryptoRouter);
routes.use("/payment", paymentRouter);
routes.use("/profile", profileRoute);
routes.use("/kyc", kycRoute);
routes.use("/admin", adminRouter);
routes.use("/accounts", accountRouter);
export default routes;