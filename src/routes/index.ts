import { Router } from "express";
import customerRouter from "./customerRoute.js";
import cryptoRouter from "./cryptoRoute.js";
import paymentRouter from "./paymentRoute.js";
import authRoute from "./authRoute.js";
import profileRoute from "./profileRoute.js";
import kycRoute from "./kycRoute.js";
import adminRouter from "./adminRoute.js";
import miscRoute from "./miscRoute.js";
import accountRouter from "./accountRoute.js";
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