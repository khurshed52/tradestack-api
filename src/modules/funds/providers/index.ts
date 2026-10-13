import type {
  PaymentProviderAdapter,
} from "./paymentProvider.js";

import {
  stripePaymentProvider,
} from "./stripe.provider.js";

import {
  coinPaymentsProvider,
} from "./coinpayments.provider.js";

export const getPaymentProvider = (
  provider: string
): PaymentProviderAdapter => {
  switch (provider) {
    case "STRIPE":
      return stripePaymentProvider;

    case "COINPAYMENTS":
      return coinPaymentsProvider;

    default:
      throw new Error(
        "PAYMENT_PROVIDER_NOT_SUPPORTED"
      );
  }
};