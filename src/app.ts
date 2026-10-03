import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";

import routes from "./routes/index.js";

import { stripeWebhook } from "./modules/payment/stripeWebhook.controller.js";
import { stripeFundsWebhook } from "./modules/funds/providers/stripeWebhook.controller.js";
import { veriffWebhook } from "./modules/kyc/veriffWebhook.controller.js";

import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

// ==========================
// SECURITY
// ==========================

app.use(helmet());

// ==========================
// CORS
// ==========================

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// ==========================
// COOKIES
// ==========================

app.use(cookieParser());

// ======================================================
// RAW BODY WEBHOOKS
//
// IMPORTANT:
// These routes MUST remain BEFORE express.json().
//
// Stripe and Veriff signature verification require
// the original raw request body.
// ======================================================

// ==========================
// STRIPE WEBHOOK
// LEGACY PAYMENT / ORDER
// ==========================

app.post(
  "/api/payment/webhook",
  express.raw({
    type: "application/json",
  }),
  stripeWebhook
);

// ==========================
// STRIPE WEBHOOK
// FUNDS / DEPOSIT
// ==========================

app.post(
  "/api/funds/webhooks/stripe",
  express.raw({
    type: "application/json",
  }),
  stripeFundsWebhook
);

// ==========================
// VERIFF WEBHOOK
// ==========================

app.post(
  "/api/kyc/veriff/webhook",
  express.raw({
    type: "application/json",
  }),
  veriffWebhook
);

// ==========================
// BODY PARSER
// ==========================

// Must remain AFTER raw-body webhook routes.
app.use(express.json());

// ==========================
// API ROUTES
// ==========================

app.use("/api", routes);

// ==========================
// TEST ROUTE
// ==========================

app.get("/customer", (_req, res) => {
  return res.send("hello everybody");
});

// ==========================
// CENTRAL ERROR HANDLER
// MUST BE LAST
// ==========================

app.use(errorHandler);