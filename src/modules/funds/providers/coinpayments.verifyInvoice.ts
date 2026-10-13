
import { coinPaymentsRequest } from "./coinpayments.client.js";
import { coinPaymentsConfig } from "../../../config/coinpayments.js";

type CoinPaymentsInvoice = {
  id?: string;
  invoiceId?: string;
  status?: string;
  currency?: {
    symbol?: string;
  };
  amount?: {
    total?: string;
  };
  payments?: Array<{
    paymentCurrencyId?: string;
    state?: string;
    actualAmount?: string;
    nativeActualAmount?: string;
    nativeExpectedAmount?: string;
  }>;
};

type VerifyInvoiceInput = {
  providerReference: string;
  paymentAttemptId: string;
  expectedAmount: string;
  expectedCurrency: string;
};

export async function verifyCoinPaymentsInvoice(
  input: VerifyInvoiceInput
): Promise<boolean> {
  if (
    !/^[0-9a-fA-F-]{36}$/.test(input.providerReference)
  ) {
    return false;
  }

  const invoice =
    await coinPaymentsRequest<CoinPaymentsInvoice>(
      "GET",
      `/api/v2/merchant/invoices/${input.providerReference}`
    );

  if (
    invoice.id !== input.providerReference ||
    invoice.invoiceId !== input.paymentAttemptId ||
    invoice.status !== "completed"
  ) {
    return false;
  }

  if (
    invoice.currency?.symbol?.toUpperCase() !==
    input.expectedCurrency.toUpperCase()
  ) {
    return false;
  }

  // Compare decimal amounts without floating-point arithmetic.
  const normalizeAmount = (value: string): string | null => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) {
      return null;
    }

    const [whole, fraction = ""] = value.split(".");
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
    const normalizedFraction = fraction.replace(/0+$/, "");

    return normalizedFraction
      ? `${normalizedWhole}.${normalizedFraction}`
      : normalizedWhole;
  };

  const expectedAmount = normalizeAmount(input.expectedAmount);
  const actualAmount = invoice.amount?.total
    ? normalizeAmount(invoice.amount.total)
    : null;

  if (
    expectedAmount === null ||
    actualAmount === null ||
    expectedAmount !== actualAmount
  ) {
    return false;
  }


  const validPayment = invoice.payments?.some(
    (payment) => {
      if (
        payment.paymentCurrencyId !==
          coinPaymentsConfig.currencies.LTCT.id ||
        payment.state?.toLowerCase() !== "completed"
      ) {
        return false;
      }

      const receivedAmount = payment.nativeActualAmount
        ? normalizeAmount(payment.nativeActualAmount)
        : null;

      const requiredAmount = payment.nativeExpectedAmount
        ? normalizeAmount(payment.nativeExpectedAmount)
        : null;

      return (
        receivedAmount !== null &&
        requiredAmount !== null &&
        receivedAmount === requiredAmount &&
        receivedAmount === expectedAmount
      );
    }
  );

  return validPayment === true;
}
