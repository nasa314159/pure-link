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

// Server-side activation gate for NEW AI credit purchases. Purchases stay
// disabled by default in every deployment — including production — regardless
// of provider configuration or direct requests. They are enabled only when the
// deployment explicitly sets AI_CREDIT_PURCHASES_ENABLED to the exact string
// 'true':
// - Absent or empty → disabled (the deployed default; fail-closed).
// - 'false' → explicitly disabled.
// - Anything else ('True', '1', 'on', typos, surrounding text) → unrecognized,
//   treated as disabled and logged; a malformed value can never enable
//   purchases.
// Each payment provider stays independently fail-closed behind its own
// *_CHECKOUT_ENABLED flag and full credential checks. Webhooks, credit
// balances, and historical payment records are unchanged by this gate either
// way: settled orders can always be fulfilled.
// Production must keep the variable unset until explicit launch approval.
export const AI_CREDIT_PURCHASES_ENABLED_VALUE = 'true';

export function isAiCreditPurchasesEnabled(env) {
  const value = String(env?.AI_CREDIT_PURCHASES_ENABLED ?? '').trim();
  if (value === AI_CREDIT_PURCHASES_ENABLED_VALUE) return true;
  if (value === '' || value === 'false') return false;
  console.warn('AI credit purchases stay disabled: AI_CREDIT_PURCHASES_ENABLED holds an unrecognized value.');
  return false;
}

export async function createCreditCheckout({ provider, requestUrl, user, packId, locale, env, fetchImplementation }) {
  if (!isAiCreditPurchasesEnabled(env)) throw new PaymentError('billingUnavailable', 503);
  if (provider === 'ecpay') return createEcpayCheckout({ requestUrl, user, packId, locale, env });
  if (provider === 'lemon') return createLemonCreditCheckout({ requestUrl, user, packId, locale, env, fetchImplementation });
  throw new PaymentError('billingProviderInvalid', 400);
}
