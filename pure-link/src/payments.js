import { createEcpayCheckout, isEcpayCheckoutConfigured } from './ecpay.js';
import { createLemonCreditCheckout, isLemonCheckoutConfigured } from './lemon-squeezy.js';
import { PaymentError } from './payment-error.js';

export { PaymentError } from './payment-error.js';

export function enabledPaymentProviders(env) {
  return Object.freeze({
    ecpay: isEcpayCheckoutConfigured(env),
    lemon: isLemonCheckoutConfigured(env),
  });
}

// Public beta: paid AI credit purchases are disabled server-side, regardless of
// provider configuration or direct requests. Re-enable by removing this guard;
// webhooks, balances, and historical payment records remain untouched.
export const AI_CREDIT_PURCHASES_DISABLED = true;

export async function createCreditCheckout({ provider, requestUrl, user, packId, locale, env, fetchImplementation }) {
  if (AI_CREDIT_PURCHASES_DISABLED) throw new PaymentError('billingUnavailable', 503);
  if (provider === 'ecpay') return createEcpayCheckout({ requestUrl, user, packId, locale, env });
  if (provider === 'lemon') return createLemonCreditCheckout({ requestUrl, user, packId, locale, env, fetchImplementation });
  throw new PaymentError('billingProviderInvalid', 400);
}
