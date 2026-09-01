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

export async function createCreditCheckout({ provider, requestUrl, user, packId, locale, env, fetchImplementation }) {
  if (provider === 'ecpay') return createEcpayCheckout({ requestUrl, user, packId, locale, env });
  if (provider === 'lemon') return createLemonCreditCheckout({ requestUrl, user, packId, locale, env, fetchImplementation });
  throw new PaymentError('billingProviderInvalid', 400);
}
