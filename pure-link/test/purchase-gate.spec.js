import { describe, expect, it } from 'vitest';
import { isAiCreditPurchasesEnabled, createCreditCheckout, enabledPaymentProviders } from '../src/payments.js';
import { isEcpayCheckoutConfigured } from '../src/ecpay.js';
import { isEcpaySupportCheckoutConfigured } from '../src/ecpay-support.js';
import { isLemonCheckoutConfigured } from '../src/lemon-squeezy.js';

// Minimal in-memory stub that records checkout writes; enough to assert that
// a rejected checkout writes nothing.
function checkoutRequestStub() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...values) {
          return {
            async run() { rows.push({ sql: normalized, values }); return { success: true, meta: { changes: 1 } }; },
            async first() { return null; },
          };
        },
      };
    },
  };
}

// Fully configured, independently-gated provider credentials. These never
// enable a checkout by themselves: the credit purchase gate AND the provider
// flag AND complete provider credentials must all be present.
const ecpayEnv = {
  ECPAY_CHECKOUT_ENABLED: 'true', ECPAY_MERCHANT_ID: '2000132', ECPAY_HASH_KEY: 'test-hash-key-12', ECPAY_HASH_IV: 'test-hash-iv-123', ECPAY_ENVIRONMENT: 'stage', PUBLIC_ORIGIN: 'https://no-no.uk',
};
const lemonEnv = {
  LEMON_SQUEEZY_CHECKOUT_ENABLED: 'true', LEMON_SQUEEZY_API_KEY: 'lemon-api-key', LEMON_SQUEEZY_WEBHOOK_SECRET: 'webhook-secret', LEMON_SQUEEZY_STORE_ID: '1',
  LEMON_SQUEEZY_VARIANT_SMALL_ID: '101', LEMON_SQUEEZY_VARIANT_STANDARD_ID: '102', LEMON_SQUEEZY_VARIANT_LARGE_ID: '103',
};

describe('AI credit purchase activation gate', () => {
  it('is disabled when the flag is absent, empty, explicitly false, or malformed', () => {
    // Absent / empty: the deployed default, fail-closed.
    expect(isAiCreditPurchasesEnabled({})).toBe(false);
    expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: '' })).toBe(false);
    expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: '   ' })).toBe(false);
    // Explicitly disabled.
    expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: 'false' })).toBe(false);
    // Malformed or unrecognized values never enable purchases.
    for (const malformed of ['FALSE', 'False', 'TRUE', 'True', '1', '0', 'yes', 'on', 'enabled', 'launch-approved', 'true7', 'xtrue', 'true,x']) {
      expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: malformed })).toBe(false);
    }
  });

  it('enables purchases only for the exact recognized value', () => {
    expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: 'true' })).toBe(true);
    // Surrounding whitespace is ignored; anything past the trim must match
    // exactly, so 'true ' and '  true  ' enable while 'true7' never does.
    expect(isAiCreditPurchasesEnabled({ AI_CREDIT_PURCHASES_ENABLED: ' true ' })).toBe(true);
    expect(isAiCreditPurchasesEnabled(undefined)).toBe(false);
    expect(isAiCreditPurchasesEnabled(null)).toBe(false);
  });

  it('keeps provider configuration independently fail-closed', () => {
    // No configuration at all: no provider is available, even with the gate on.
    expect(enabledPaymentProviders({})).toEqual({ ecpay: false, lemon: false });
    // Missing credentials or an incomplete Lemon variant mapping fail closed.
    expect(isEcpayCheckoutConfigured({ ...ecpayEnv, ECPAY_HASH_KEY: 'short' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...ecpayEnv, ECPAY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isLemonCheckoutConfigured({ ...lemonEnv, LEMON_SQUEEZY_VARIANT_LARGE_ID: '' })).toBe(false);
    expect(isLemonCheckoutConfigured({ ...lemonEnv, LEMON_SQUEEZY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    // Enabling support never enables the AI-credit rail, and the credit gate
    // never enables support.
    expect(isEcpaySupportCheckoutConfigured({ ...ecpayEnv, ECPAY_SUPPORT_CHECKOUT_ENABLED: 'true' })).toBe(true);
    expect(enabledPaymentProviders({ ...ecpayEnv, ECPAY_SUPPORT_CHECKOUT_ENABLED: 'true', ECPAY_CHECKOUT_ENABLED: 'false' })).toEqual({ ecpay: false, lemon: false });
  });

  it('rejects credit checkout fail-closed when the gate is on but no provider is configured', async () => {
    for (const provider of ['ecpay', 'lemon']) {
      await expect(createCreditCheckout({
        provider, requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, packId: 'small', locale: 'en',
        env: { AI_CREDIT_PURCHASES_ENABLED: 'true' },
      })).rejects.toMatchObject({ code: 'billingUnavailable', status: 503 });
    }
  });

  it('rejects credit checkout fail-closed while disabled, regardless of direct requests', async () => {
    const env = { ...ecpayEnv, ...lemonEnv, AI_CREDIT_PURCHASES_ENABLED: 'false', pure_link_db: checkoutRequestStub() };
    await expect(createCreditCheckout({
      provider: 'ecpay', requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, packId: 'small', locale: 'en', env,
    })).rejects.toMatchObject({ code: 'billingUnavailable', status: 503 });
    expect(env.pure_link_db.rows).toHaveLength(0);
  });
});
