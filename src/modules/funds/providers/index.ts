import type {
  PaymentProviderAdapter,
} from "./paymentProvider.js";

import {
  stripePaymentProvider,
} from "./stripe.provider.js";

export const getPaymentProvider = (
  provider: string
): PaymentProviderAdapter => {
  switch (provider) {
    case "STRIPE":
      return stripePaymentProvider;

    default:
      throw new Error(
        "PAYMENT_PROVIDER_NOT_SUPPORTED"
      );
  }
};