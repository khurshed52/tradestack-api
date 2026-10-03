// ============================================================
// DEPOSIT
// ============================================================

export type CreateDepositPaymentInput = {
  paymentAttemptId: string;
  fundTransactionId: string;
  accountNumber: string;
  amount: string;
  currency: string;
};

export type CreateDepositPaymentResult = {
  providerReference: string;
  checkoutUrl: string;
};

// ============================================================
// WITHDRAWAL / PAYOUT
// ============================================================

export type CreateWithdrawalPayoutInput = {
  fundTransactionId: string;

  accountNumber: string;

  // Amount the customer receives after FX conversion
  amount: string;

  // Currency the customer receives
  currency: string;

  /*
   * Provider-specific payout destination.
   *
   * We keep this generic for now because different
   * PSPs require different destination information:
   *
   * Stripe  -> connected account / external account
   * Skrill  -> wallet/email
   * Fatoora -> provider-specific destination
   *
   * We will make this more structured when implementing
   * each provider.
   */
  destination: Record<string, unknown>;
};

export type CreateWithdrawalPayoutResult = {
  /*
   * Unique payout/transfer ID returned by the PSP.
   *
   * This will later allow us to match PSP webhooks
   * back to our FundTransaction.
   */
  providerReference: string;

  /*
   * Some PSPs immediately accept the payout while
   * others may process it asynchronously.
   */
  status:
    | "PENDING"
    | "PROCESSING"
    | "COMPLETED";
};

// ============================================================
// PAYMENT PROVIDER ADAPTER
// ============================================================

export interface PaymentProviderAdapter {
  // --------------------------
  // DEPOSIT
  // --------------------------

  createDepositPayment(
    input: CreateDepositPaymentInput
  ): Promise<CreateDepositPaymentResult>;

  // --------------------------
  // WITHDRAWAL
  // --------------------------

  createWithdrawalPayout?(
    input: CreateWithdrawalPayoutInput
  ): Promise<CreateWithdrawalPayoutResult>;
}