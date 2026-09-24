import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";

import routes from "./routes/index.js";
import { stripeWebhook } from "./controller/StripeWebhookController.js";
import { veriffWebhook } from "./controller/VeriffWebhookController.js";

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

// ==========================
// STRIPE WEBHOOK
// ==========================

// Stripe signature verification requires the original bytes,
// so this must stay BEFORE express.json().
app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

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

app.use(express.json());

// ==========================
// API ROUTES
// ==========================

app.use("/api", routes);

// Test route
app.get("/customer", (_req, res) => {
  return res.send("hello everybody");
});

// ==========================
// CENTRAL ERROR HANDLER
// MUST BE LAST
// ==========================

app.use(errorHandler);
