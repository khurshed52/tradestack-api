
import type { Request, Response } from "express";
import { verifyCoinPaymentsWebhookSignature } from "./coinpayments.webhookSignature.js";
import { findCoinPaymentsPaymentAttempt } from "./coinpayments.findPaymentAttempt.js";
const webhookUrl = process.env.COINPAYMENTS_WEBHOOK_URL;
import { verifyCoinPaymentsInvoice } from "./coinpayments.verifyInvoice.js";
import { settleCoinPaymentsDeposit } from "./coinpayments.settleDeposit.js";
// ======================================================
// COINPAYMENTS WEBHOOK
// FUNDS / CRYPTO DEPOSIT
// ======================================================

export async function coinPaymentsWebhook(
  req: Request,
  res: Response
): Promise<void> {

  // ----------------------------------------------------
  // REQUIRE CONFIGURATION AND RAW REQUEST BODY
  // ----------------------------------------------------

  if (!webhookUrl || !Buffer.isBuffer(req.body)) {
    res.sendStatus(503);
    return;
  }

  // ----------------------------------------------------
  // VERIFY COINPAYMENTS SIGNATURE
  // ----------------------------------------------------

  const verified = verifyCoinPaymentsWebhookSignature({
    url: webhookUrl,
    clientId: req.get("X-CoinPayments-Client"),
    timestamp: req.get("X-CoinPayments-Timestamp"),
    signature: req.get("X-CoinPayments-Signature"),
    rawBody: req.body,
  });

  if (!verified) {
    res.sendStatus(401);
    return;
  }

  // ----------------------------------------------------
  // PARSE VERIFIED WEBHOOK PAYLOAD
  // ----------------------------------------------------

  let event: unknown;

  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.sendStatus(400);
    return;
  }

  if (
    typeof event !== "object" ||
    event === null ||
    Array.isArray(event)
  ) {
    res.sendStatus(400);
    return;
  }

  const payload = event as Record<string, unknown>;

  // ----------------------------------------------------
  // IDENTIFY EVENT TYPE
  // CoinPayments recommends case-insensitive matching.
  // ----------------------------------------------------

  const eventType =
    typeof payload.type === "string"
      ? payload.type.toLowerCase()
      : "";

  // ----------------------------------------------------
  // IGNORE EVENTS OTHER THAN INVOICE COMPLETED
  // ----------------------------------------------------

  if (eventType !== "invoicecompleted") {
    res.sendStatus(200);
    return;
  }

  // ----------------------------------------------------
  // EXTRACT COINPAYMENTS INVOICE ID
  // ----------------------------------------------------

  const invoiceId =
    typeof payload.id === "string"
      ? payload.id
      : "";

  if (!invoiceId) {
    res.sendStatus(400);
    return;
  }

  // ----------------------------------------------------
  // FIND MATCHING TRADESTACK PAYMENT ATTEMPT
  // ----------------------------------------------------

  try {
    const paymentAttempt =
      await findCoinPaymentsPaymentAttempt(invoiceId);

    if (!paymentAttempt) {
      console.warn(
        "CoinPayments completed invoice has no matching payment attempt"
      );

      // Do not acknowledge an unmatched completed
      // invoice while settlement is unfinished.
      res.sendStatus(503);
      return;
    }

    // --------------------------------------------------
    // LOG MATCHED PAYMENT ATTEMPT
    // --------------------------------------------------

    console.info("CoinPayments deposit matched", {
      paymentAttemptId: paymentAttempt.id,
      status: paymentAttempt.status,
    });


    // --------------------------------------------------
    // VERIFY INVOICE DIRECTLY WITH COINPAYMENTS
    // --------------------------------------------------

    const invoiceVerified =
      await verifyCoinPaymentsInvoice({
        providerReference: invoiceId,
        paymentAttemptId: paymentAttempt.id,
        expectedAmount: paymentAttempt.amount.toString(),
        expectedCurrency: paymentAttempt.currency,
      });

    if (!invoiceVerified) {
      console.warn(
        "CoinPayments invoice not eligible for settlement",
        { paymentAttemptId: paymentAttempt.id }
      );

      res.sendStatus(503);
      return;
    }

    console.info("CoinPayments invoice verified", {
      paymentAttemptId: paymentAttempt.id,
    });

    // Settle only after independent CoinPayments verification.
const settlementResult = await settleCoinPaymentsDeposit({
  paymentAttemptId: paymentAttempt.id,
  providerReference: invoiceId,
});

console.info("CoinPayments deposit settlement result", {
  paymentAttemptId: paymentAttempt.id,
  result: settlementResult,
});

res.sendStatus(200);
return;

    // --------------------------------------------------
    // IMPORTANT: SETTLEMENT NOT IMPLEMENTED YET
    //
    // We still need to:
    // 1. Retrieve the invoice from CoinPayments.
    // 2. Verify completed status.
    // 3. Verify invoice ID, amount, and currency.
    // 4. Complete the deposit atomically.
    // 5. Prevent duplicate balance credits.
    //
    // Return 503 until settlement is implemented
    // so a real completed event is not silently
    // acknowledged and discarded.
    // --------------------------------------------------

   // res.sendStatus(503);
   // return;

  } catch (error) {
    console.error(
      "CoinPayments payment attempt lookup failed",
      error
    );

    res.sendStatus(500);
    return;
  }
}
