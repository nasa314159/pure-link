import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PAYPAL_SUPPORT_MAX_AMOUNT_MINOR,
  PAYPAL_SUPPORT_MIN_AMOUNT_MINOR,
  PAYPAL_SUPPORT_PRESET_AMOUNTS_MINOR,
  createPaypalSupportCheckout,
  getPaypalSupportTotals,
  handlePaypalSupportBrowserReturn,
  handlePaypalWebhook,
  isPaypalSupportCheckoutConfigured,
  isPaypalWebhookConfigured,
  minorToDecimalText,
  parsePaypalSupportAmount,
  reconcilePaypalSupport,
} from '../src/paypal-support.js';

const CANONICAL_ORIGIN = 'https://no-no.uk';
const env = {
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'paypal-client-id-0000000001',
  PAYPAL_CLIENT_SECRET: 'paypal-client-secret-00000000001',
  PAYPAL_WEBHOOK_ID: 'paypal-webhook-id-000000001',
  PAYPAL_MERCHANT_ID: 'X5XAHHCG636FA',
  PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'true',
  PAYPAL_RECONCILE_TOKEN: 'reconcile-token-0000000000000000001',
  PUBLIC_ORIGIN: CANONICAL_ORIGIN,
  RATE_LIMIT_SECRET: 'rate-limit-test-secret',
  TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
  TURNSTILE_SITE_KEY: 'site-key',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Real-SQLite D1 adapter: constraints, triggers, and uniqueness behave exactly
// as they will in D1, so accounting invariants are tested at the database edge.
class SqliteD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(readFileSync(new URL('../migrations/0000_legacy_base.sql', import.meta.url), 'utf8'));
    this.db.exec(readFileSync(new URL('../migrations/0016_paypal_support.sql', import.meta.url), 'utf8'));
  }

  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const statement = this.db.prepare(normalized);
    const bound = { values: [] };
    return {
      bind(...values) { bound.values = values; return this; },
      async run() {
        const info = statement.run(...bound.values);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
      async first() { return statement.get(...bound.values) ?? null; },
      async all() { return { results: statement.all(...bound.values) }; },
      get sql() { return normalized; },
    };
  }
}

// Synchronous query helpers over the underlying node:sqlite database.
function rows(db, sql, ...params) { return db.db.prepare(sql).all(...params); }
function row(db, sql, ...params) { return db.db.prepare(sql).get(...params) ?? null; }

const APPROVE_LINK = (orderId, host = 'https://www.sandbox.paypal.com') => ({ rel: 'payer-action', href: `${host}/checkoutnow?token=${orderId}` });

function orderBody({ id, status, amountMinor = '5.00', merchantId = env.PAYPAL_MERCHANT_ID, captures = [] } = {}) {
  return {
    id,
    status,
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'pl-sup-ref',
      amount: { currency_code: 'USD', value: amountMinor },
      payee: { merchant_id: merchantId },
      payments: captures.length ? { captures } : undefined,
    }],
    links: [APPROVE_LINK(id)],
  };
}

function captureResource({ captureId = 'CAPTURE-1', orderId = 'ORDER-1', status = 'COMPLETED', amountMinor = '5.00', merchantId = env.PAYPAL_MERCHANT_ID, finalCapture = true } = {}) {
  return {
    id: captureId,
    status,
    amount: { currency_code: 'USD', value: amountMinor },
    final_capture: finalCapture,
    payee: { merchant_id: merchantId },
    supplementary_data: { related_ids: { order_id: orderId } },
  };
}

function refundResource({ refundId = 'REFUND-1', captureId = 'CAPTURE-1', status = 'COMPLETED', amountMinor = '0.30' } = {}) {
  return {
    id: refundId,
    status,
    amount: { currency_code: 'USD', value: amountMinor },
    links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
  };
}

// A scripted fetch: queued OAuth + PayPal API answers with call recording.
function scriptedFetch(queue) {
  const calls = [];
  const implementation = async (url, init = {}) => {
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = null; }
    const call = { url: String(url), method: init.method || 'GET', init, body };
    calls.push(call);
    if (url.includes('/v1/oauth2/token')) return jsonResponse({ access_token: `token-${calls.length}`, expires_in: 32400 });
    const next = queue.shift();
    if (!next) return jsonResponse({ message: 'unexpected PayPal request' }, 500);
    return typeof next === 'function' ? next(call) : next;
  };
  implementation.calls = calls;
  return implementation;
}

function paypalCalls(implementation) {
  return implementation.calls.filter((call) => !call.url.includes('/v1/oauth2/token') && !call.url.includes('verify-webhook-signature'));
}

async function pendingCheckout({ db, amount = '5.00', input = {}, orderId = 'ORDER-1' } = {}) {
  const implementation = scriptedFetch([
    jsonResponse({ id: orderId, links: [APPROVE_LINK(orderId)] }),
  ]);
  const checkout = await createPaypalSupportCheckout({
    requestUrl: new URL(`${CANONICAL_ORIGIN}/en/support`),
    locale: 'en',
    input: { amount, publicName: true, displayName: 'nasa', publicMessage: true, message: 'thanks @everyone', publicAmount: true, ...input },
    env: { ...env, pure_link_db: db },
    fetchImplementation: implementation,
  });
  return { checkout, implementation, orderId };
}

function webhookRequest(payload, headers = {}) {
  return new Request(`${CANONICAL_ORIGIN}/api/webhooks/paypal-support`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1', 'paypal-transmission-id': 'trans-1', 'paypal-transmission-sig': 'sig-1', 'paypal-transmission-time': '2026-11-27T00:00:00Z', ...headers },
    body: JSON.stringify(payload),
  });
}

function verifiedWebhook(implementation, verification = 'SUCCESS') {
  return implementation || scriptedFetch([
    jsonResponse({ verification_status: verification }),
  ]);
}

function eventPayload(eventType, resource) {
  return { id: `WH-EVENT-${eventType.replaceAll('.', '-')}-${Math.random().toString(36).slice(2, 8)}`, event_type: eventType, resource };
}

describe('PayPal support configuration and amounts', () => {
  it('is independently fail-closed and isolated from other providers', () => {
    expect(isPaypalSupportCheckoutConfigured({})).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'True' })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_CLIENT_SECRET: undefined })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_MERCHANT_ID: '' })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_ENVIRONMENT: 'live' })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured(env)).toBe(true);
    // Live checkout is bound to the canonical public origin only.
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_ENVIRONMENT: 'production', PUBLIC_ORIGIN: 'https://staging.no-no.uk' })).toBe(false);
    expect(isPaypalSupportCheckoutConfigured({ ...env, PAYPAL_ENVIRONMENT: 'production', PUBLIC_ORIGIN: CANONICAL_ORIGIN })).toBe(true);
    // Webhook processing stays available while new checkout is disabled.
    expect(isPaypalWebhookConfigured({ ...env, PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'false' })).toBe(true);
    expect(isPaypalWebhookConfigured({ ...env, PAYPAL_WEBHOOK_ID: 'short' })).toBe(false);
  });

  it('uses the provisional USD presets and custom range in exact minor units', () => {
    expect(PAYPAL_SUPPORT_PRESET_AMOUNTS_MINOR).toEqual([500, 1000, 2000, 3000]);
    expect(PAYPAL_SUPPORT_MIN_AMOUNT_MINOR).toBe(300);
    expect(PAYPAL_SUPPORT_MAX_AMOUNT_MINOR).toBe(30000);
    expect(parsePaypalSupportAmount('5')).toBe(500);
    expect(parsePaypalSupportAmount('10')).toBe(1000);
    expect(parsePaypalSupportAmount('20')).toBe(2000);
    expect(parsePaypalSupportAmount('30')).toBe(3000);
    expect(parsePaypalSupportAmount('3')).toBe(300);
    expect(parsePaypalSupportAmount('300')).toBe(30000);
    expect(parsePaypalSupportAmount('3.5')).toBe(350);
    expect(parsePaypalSupportAmount('3.50')).toBe(350);
    expect(minorToDecimalText(2970)).toBe('29.70');
    expect(minorToDecimalText(500)).toBe('5.00');
  });

  it.each([
    ['', 'empty'], ['2.99', 'below minimum'], ['300.01', 'above maximum'], ['1000', 'beyond max dollars'],
    ['0', 'zero'], ['-5', 'negative'], ['5 ', 'trailing space'], [' 5', 'leading space'], ['5.000', 'three decimals'],
    ['5.004', 'three decimals'], ['abc', 'non-numeric'], ['1e2', 'scientific'], ['5,00', 'comma decimals'],
    ['NaN', 'not a number'], ['0x10', 'hexadecimal'], ['٣', 'non-ascii digit'],
  ])('rejects invalid USD amount input: %s (%s)', (value) => {
    expect(parsePaypalSupportAmount(value)).toBeNull();
  });

  it('never exposes secrets in checkout responses or logs', async () => {
    const db = new SqliteD1();
    const { checkout, implementation } = await pendingCheckout({ db });
    expect(JSON.stringify(checkout)).not.toContain(env.PAYPAL_CLIENT_SECRET);
    expect(JSON.stringify(checkout)).not.toContain('Bearer');
    const create = paypalCalls(implementation).find((call) => call.url.includes('/v2/checkout/orders'));
    expect(create.init.headers.authorization).toBe('Bearer token-1');
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')).toEqual([{ status: 'pending' }]);
  });
});

describe('PayPal support checkout creation', () => {
  it('creates a local checkout row and redirects to the allowlisted sandbox approval URL', async () => {
    const db = new SqliteD1();
    const { checkout, implementation } = await pendingCheckout({ db, input: { publicName: true, displayName: 'nasa', publicMessage: true, message: 'thanks @everyone', publicAmount: true } });
    expect(checkout.provider).toBe('paypal');
    expect(checkout.checkoutUrl).toBe('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1');
    const row = rows(db, 'SELECT * FROM paypal_support_checkouts')[0];
    expect(row).toMatchObject({
      paypal_order_id: 'ORDER-1', expected_amount_minor: 500, expected_currency: 'USD',
      merchant_id: env.PAYPAL_MERCHANT_ID, status: 'pending',
      public_name: 1, public_message: 1, public_amount: 1, public_display_name: 'nasa',
    });
    expect(row.public_message_text).toBe('thanks @everyone');
    const create = paypalCalls(implementation).find((call) => call.url.includes('/v2/checkout/orders'));
    expect(create.body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '5.00' });
    expect(create.init.headers['paypal-request-id']).toMatch(/^cre-[0-9a-f]{32}$/);
    expect(create.body.payment_source.paypal.experience_context.return_url).toBe(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?locale=en`);
  });

  it('marks the row failed and never leaks a foreign approval URL', async () => {
    const db = new SqliteD1();
    const implementation = scriptedFetch([
      jsonResponse({ id: 'ORDER-X', links: [{ rel: 'payer-action', href: 'https://evil.example/checkoutnow?token=ORDER-X' }] }),
    ]);
    await expect(createPaypalSupportCheckout({
      requestUrl: new URL(`${CANONICAL_ORIGIN}/en/support`), locale: 'en', input: { amount: '5' }, env: { ...env, pure_link_db: db }, fetchImplementation: implementation,
    })).rejects.toMatchObject({ code: 'billingProviderFailed' });
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')).toEqual([{ status: 'failed' }]);
  });

  it('rejects invalid amounts before any row or PayPal call exists', async () => {
    const db = new SqliteD1();
    const implementation = scriptedFetch([]);
    for (const amount of ['2.99', '300.01', 'abc', '', '5.004']) {
      await expect(createPaypalSupportCheckout({
        requestUrl: new URL(`${CANONICAL_ORIGIN}/en/support`), locale: 'en', input: { amount }, env, fetchImplementation: implementation,
      })).rejects.toMatchObject({ code: 'supportAmountInvalid' });
    }
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_checkouts')[0].n).toBe(0);
    expect(implementation.calls).toHaveLength(0);
  });

  it('refuses checkout when disabled or unconfigured without touching PayPal', async () => {
    const db = new SqliteD1();
    const implementation = scriptedFetch([]);
    await expect(createPaypalSupportCheckout({
      requestUrl: new URL(`${CANONICAL_ORIGIN}/en/support`), locale: 'en', input: { amount: '5' }, env: { ...env, PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'false' }, fetchImplementation: implementation,
    })).rejects.toMatchObject({ code: 'supportUnavailable' });
    expect(implementation.calls).toHaveLength(0);
  });
});

describe('capture verification and accounting convergence', () => {
  it('records one verified capture from the browser return without trusting the browser', async () => {
    const db = new SqliteD1();
    const { implementation: createImplementation } = await pendingCheckout({ db });
    void createImplementation;
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const response = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/en/support?thanks=1');
    const contribution = rows(db, 'SELECT * FROM paypal_support_contributions')[0];
    expect(contribution).toMatchObject({
      paypal_capture_id: 'CAPTURE-1', paypal_order_id: 'ORDER-1', amount_minor: 500,
      currency: 'USD', merchant_id: env.PAYPAL_MERCHANT_ID, status: 'completed', refunded_amount_minor: 0,
      public_name: 1, public_message: 1, public_amount: 1,
    });
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')[0]).toEqual({ status: 'completed' });
    // The capture used the durable per-checkout request id.
    const captureCall = paypalCalls(api).find((call) => call.url.includes('/capture'));
    expect(captureCall.init.headers['paypal-request-id']).toMatch(/^cap-[0-9a-f]{32}$/);
  });

  it('redirects unknown, foreign, and unapproved orders to the pending state without recording anything', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db, amount: '5.00' });
    // Unknown order id.
    const unknownApi = scriptedFetch([]);
    const unknown = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-UNKNOWN&locale=en`), { ...env, pure_link_db: db }, unknownApi);
    expect(unknown.headers.get('location')).toBe('/en/support?support=pending');
    expect(paypalCalls(unknownApi)).toHaveLength(0);
    // Known order, still CREATED (not approved).
    const createdApi = scriptedFetch([jsonResponse(orderBody({ id: 'ORDER-1', status: 'CREATED' }))]);
    const created = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, createdApi);
    expect(created.headers.get('location')).toBe('/en/support?support=pending');
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
    expect(paypalCalls(createdApi).some((call) => call.url.includes('/capture'))).toBe(false);
  });

  it.each([
    ['amount mismatch', orderBody({ id: 'ORDER-1', status: 'APPROVED', amountMinor: '4.00' }), jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', amountMinor: '4.00', captures: [captureResource({ amountMinor: '4.00' })] }))],
    ['currency mismatch', orderBody({ id: 'ORDER-1', status: 'APPROVED', amountMinor: '5.00' }), jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource({ amountMinor: '5.00' })] }))],
  ])('rejects %s before recording', async (_label, approvedOrder, completedOrder) => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const mismatched = JSON.parse(JSON.stringify(approvedOrder));
    if (_label === 'currency mismatch') mismatched.purchase_units[0].amount.currency_code = 'EUR';
    const api = scriptedFetch([jsonResponse(mismatched)]);
    const response = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(response.headers.get('location')).toBe('/en/support?support=pending');
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
    // An amount/currency mismatch must never trigger a capture attempt.
    expect(paypalCalls(api).some((call) => call.url.includes('/capture'))).toBe(false);
  });

  it('rejects a merchant (payee) mismatch even when everything else verifies', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', merchantId: 'ATTACKER-MERCHANT', captures: [captureResource({ merchantId: 'ATTACKER-MERCHANT' })] })),
    ]);
    const response = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(response.headers.get('location')).toBe('/en/support?support=pending');
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
  });

  it('keeps capture-pending money visible without counting it as support', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource({ status: 'PENDING' })] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')[0]).toEqual({ status: 'capture_pending' });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
    // Completing later records the contribution through the same convergence.
    const completingApi = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const response = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, completingApi);
    expect(response.headers.get('location')).toBe('/en/support?thanks=1');
    expect(rows(db, 'SELECT status FROM paypal_support_contributions')[0]).toEqual({ status: 'completed' });
  });

  it('handles an uncertain capture outcome by querying PayPal again and never guessing', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse({ id: 'ORDER-1', status: 'COMPLETED', links: [] }),
      jsonResponse({ id: 'ORDER-1', status: 'COMPLETED', links: [] }),
    ]);
    const response = await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(response.headers.get('location')).toBe('/en/support?support=pending');
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')[0]).toEqual({ status: 'capture_pending' });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
  });

  it('is idempotent for duplicate capture attempts from parallel entry points', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const browserApi = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const webhookApi = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const [browserResponse, webhookResponse] = await Promise.all([
      handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, browserApi),
      handlePaypalWebhook(webhookRequest(eventPayload('CHECKOUT.ORDER.APPROVED', orderBody({ id: 'ORDER-1', status: 'APPROVED' }))), { ...env, pure_link_db: db }, webhookApi),
    ]);
    expect(webhookResponse.status).toBeLessThan(500);
    expect(['completed', 'processed']).toContain(rows(db, 'SELECT status FROM paypal_support_checkouts')[0].status);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);
    expect(browserResponse.headers.get('location')).toMatch(/support\?(thanks=1|support=pending)/);
    // Both capture attempts used the same durable request id, so PayPal answers
    // with the same capture for both callers.
    const requestIds = [...paypalCalls(browserApi), ...paypalCalls(webhookApi)]
      .filter((call) => call.url.includes('/capture'))
      .map((call) => call.init.headers['paypal-request-id']);
    expect(new Set(requestIds).size).toBeLessThanOrEqual(1);
  });

  it('marks the checkout failed on a declined capture', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource({ status: 'DECLINED' })] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    expect(rows(db, 'SELECT status FROM paypal_support_checkouts')[0]).toEqual({ status: 'failed' });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
  });
});

describe('PayPal webhook security and durable processing', () => {
  it('rejects unverified events before recording anything', async () => {
    const db = new SqliteD1();
    const implementation = verifiedWebhook(null, 'FAILURE');
    const response = await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource())), { ...env, pure_link_db: db }, implementation);
    expect(response.status).toBe(401);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_webhook_events')[0].n).toBe(0);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
  });

  it('fails closed when the verification API is unavailable', async () => {
    const db = new SqliteD1();
    const implementation = scriptedFetch([]);
    const response = await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource())), { ...env, pure_link_db: db }, implementation);
    expect(response.status).toBe(503);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_webhook_events')[0].n).toBe(0);
  });

  it('refuses oversized and malformed payloads', async () => {
    const db = new SqliteD1();
    const huge = new Request(`${CANONICAL_ORIGIN}/api/webhooks/paypal-support`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(513 * 1024),
    });
    expect((await handlePaypalWebhook(huge, env, verifiedWebhook())).status).toBe(413);
    expect((await handlePaypalWebhook(new Request(`${CANONICAL_ORIGIN}/api/webhooks/paypal-support`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }), env, verifiedWebhook())).status).toBe(400);
    expect((await handlePaypalWebhook(webhookRequest({ no_id: true }), env, verifiedWebhook())).status).toBe(400);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_webhook_events')[0].n).toBe(0);
  });

  it('records a verified event before processing and marks it processed only after accounting commits', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const implementation = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const response = await handlePaypalWebhook(webhookRequest(eventPayload('CHECKOUT.ORDER.COMPLETED', orderBody({ id: 'ORDER-1', status: 'COMPLETED' }))), { ...env, pure_link_db: db }, implementation);
    expect(await response.json()).toEqual({ received: true });
    const event = rows(db, 'SELECT state, attempts FROM paypal_support_webhook_events')[0];
    expect(event.state).toBe('processed');
    expect(event.attempts).toBe(1);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);
  });

  it('acknowledges an exact replay without duplicating accounting', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const payload = eventPayload('CHECKOUT.ORDER.APPROVED', orderBody({ id: 'ORDER-1', status: 'APPROVED' }));
    const first = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    expect((await handlePaypalWebhook(webhookRequest(payload), { ...env, pure_link_db: db }, first)).status).toBe(200);
    const replay = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    expect((await handlePaypalWebhook(webhookRequest(payload), { ...env, pure_link_db: db }, replay)).status).toBe(200);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_webhook_events')[0].n).toBe(1);
  });

  it('keeps a failed event durably recorded and reprocesses it on redelivery', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const payload = eventPayload('CHECKOUT.ORDER.APPROVED', orderBody({ id: 'ORDER-1', status: 'APPROVED' }));
    // First delivery: PayPal lookup fails after the event is durably recorded.
    const failing = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse({ message: 'internal error' }, 500),
    ]);
    const failedResponse = await handlePaypalWebhook(webhookRequest(payload), { ...env, pure_link_db: db }, failing);
    expect(failedResponse.status).toBe(500);
    expect(rows(db, 'SELECT state FROM paypal_support_webhook_events')[0]).toEqual({ state: 'failed' });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
    // Redelivery recovers through the same convergence.
    const recovery = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    expect((await handlePaypalWebhook(webhookRequest(payload), { ...env, pure_link_db: db }, recovery)).status).toBe(200);
    expect(rows(db, 'SELECT state FROM paypal_support_webhook_events')[0]).toEqual({ state: 'processed' });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);
  });

  it('safely acknowledges capture events keyed by capture id and unknown identities', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    // PAYMENT.CAPTURE.COMPLETED with a capture identity: verified server-side
    // against the order before anything is recorded.
    const implementation = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    expect((await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource())), { ...env, pure_link_db: db }, implementation)).status).toBe(200);
    expect(rows(db, 'SELECT paypal_capture_id FROM paypal_support_contributions')[0]).toEqual({ paypal_capture_id: 'CAPTURE-1' });
    // Unknown local order: acknowledged, never recorded as support.
    const unknown = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    const unknownResponse = await handlePaypalWebhook(webhookRequest(eventPayload('CHECKOUT.ORDER.APPROVED', orderBody({ id: 'ORDER-FOREIGN', status: 'APPROVED' }))), { ...env, pure_link_db: db }, unknown);
    expect(await unknownResponse.json()).toEqual({ received: true });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);
    const event = rows(db, "SELECT last_error FROM paypal_support_webhook_events WHERE event_type = 'CHECKOUT.ORDER.APPROVED'")[0];
    expect(event.last_error).toContain('unknown-checkout');
  });

  it('never grants AI credits through this endpoint', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    const implementation = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource())), { ...env, pure_link_db: db }, implementation);
    // The support tables have no user, pack, or credit columns at all.
    const columns = db.db.prepare("SELECT name FROM pragma_table_info('paypal_support_contributions')").all().map((row) => row.name);
    for (const forbidden of ['user', 'pack', 'credit']) {
      expect(columns.some((name) => name.toLowerCase().includes(forbidden))).toBe(false);
    }
    // Webhook processing never touches any other provider's tables.
    const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    expect(tables.filter((name) => name.startsWith('ecpay_'))).toEqual([]);
    expect(tables.filter((name) => name.startsWith('lemon_'))).toEqual([]);
  });
});

describe('refunds, reversals, and late events', () => {
  async function completedCapture(db) {
    await pendingCheckout({ db });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
  }

  it('applies a partial refund then a full refund, idempotently', async () => {
    const db = new SqliteD1();
    await completedCapture(db);
    const partial = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ amountMinor: '0.30' }))), { ...env, pure_link_db: db }, partial);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'partially_refunded', refunded_amount_minor: 30 });
    // Exact duplicate refund event: acknowledged, no double accounting.
    const duplicate = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    expect((await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'REFUND-1', amountMinor: '0.30' }))), { ...env, pure_link_db: db }, duplicate)).status).toBe(200);
    expect(rows(db, 'SELECT refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ refunded_amount_minor: 30 });
    // Full refund completes the reversal of the display state.
    const full = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'REFUND-2', amountMinor: '4.70' }))), { ...env, pure_link_db: db }, full);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'refunded', refunded_amount_minor: 500 });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_refunds')[0].n).toBe(2);
  });

  it('records a refund event that arrives before its capture processing and folds it in later', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    // Refund webhook first (no contribution yet).
    const refundFirst = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    const refundResponse = await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ amountMinor: '0.30' }))), { ...env, pure_link_db: db }, refundFirst);
    expect(await refundResponse.json()).toEqual({ received: true });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_refunds')[0].n).toBe(1);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(0);
    // Capture processing later folds the refund in through the ledger.
    const capture = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, capture);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'partially_refunded', refunded_amount_minor: 30 });
  });

  it('rejects an excess refund at the database edge and acknowledges with an operator note', async () => {
    const db = new SqliteD1();
    await completedCapture(db);
    const implementation = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    const response = await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'REFUND-BIG', amountMinor: '500.01' }))), { ...env, pure_link_db: db }, implementation);
    expect(await response.json()).toEqual({ received: true });
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_refunds')[0].n).toBe(0);
    expect(rows(db, 'SELECT status FROM paypal_support_contributions')[0]).toEqual({ status: 'completed' });
    const event = rows(db, "SELECT last_error FROM paypal_support_webhook_events WHERE event_type = 'PAYMENT.CAPTURE.REFUNDED'")[0];
    expect(event.last_error).toContain('excess-refund-rejected');
  });

  it('records a PayPal reversal as a full reversal and stays idempotent', async () => {
    const db = new SqliteD1();
    await completedCapture(db);
    const implementation = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REVERSED', captureResource({ status: 'REVERSED', captureId: 'CAPTURE-1' }))), { ...env, pure_link_db: db }, implementation);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'reversed', refunded_amount_minor: 500 });
    // Duplicate reversal event: same durable operation key, no second row.
    const duplicate = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    expect((await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REVERSED', captureResource({ status: 'REVERSED', captureId: 'CAPTURE-1' }))), { ...env, pure_link_db: db }, duplicate)).status).toBe(200);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_refunds')[0].n).toBe(1);
    expect(await getPaypalSupportTotals(db)).toMatchObject({ netUsdMinor: 0, contributionCount: 0 });
  });

  it('recognizes disputes and treats unsupported and lifecycle events safely', async () => {
    const db = new SqliteD1();
    await completedCapture(db);
    const implementation = scriptedFetch([
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse({ verification_status: 'SUCCESS' }),
      jsonResponse({ verification_status: 'SUCCESS' }),
    ]);
    await handlePaypalWebhook(webhookRequest(eventPayload('CUSTOMER.DISPUTE.CREATED', { disputed_transactions: [{ seller_transaction_id: 'CAPTURE-1' }] })), { ...env, pure_link_db: db }, implementation);
    expect(rows(db, 'SELECT status FROM paypal_support_contributions')[0]).toEqual({ status: 'disputed' });
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.REFUND.PENDING', refundResource({ status: 'PENDING' }))), { ...env, pure_link_db: db }, implementation);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.REFUND.FAILED', refundResource({ status: 'FAILED' }))), { ...env, pure_link_db: db }, implementation);
    await handlePaypalWebhook(webhookRequest(eventPayload('BILLING.SUBSCRIPTION.CREATED', { id: 'SUB-1' })), { ...env, pure_link_db: db }, implementation);
    const notes = rows(db, "SELECT event_type, last_error, state FROM paypal_support_webhook_events ORDER BY event_type");
    expect(notes.every((row) => row.state === 'processed')).toBe(true);
    expect(notes.find((row) => row.event_type === 'BILLING.SUBSCRIPTION.CREATED').last_error).toContain('unsupported');
    // An unreadable refund event is acknowledged but never applied.
    const unreadable = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    expect((await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', { id: 'REFUND-X', amount: { currency_code: 'USD', value: '1.00' } })), { ...env, pure_link_db: db }, unreadable)).status).toBe(200);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_refunds')[0].n).toBe(0);
  });

  it('sums refunds across late, out-of-order, and pre-capture events without exceeding the capture', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    // Two refund events arrive before the capture is processed.
    const early = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' }), jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'R-EARLY-1', amountMinor: '1.00' }))), { ...env, pure_link_db: db }, early);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'R-EARLY-2', amountMinor: '1.00' }))), { ...env, pure_link_db: db }, early);
    const capture = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, capture);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'partially_refunded', refunded_amount_minor: 200 });
    // A late event adding up to the full amount flips the state exactly once.
    const late = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'R-LATE', amountMinor: '3.00' }))), { ...env, pure_link_db: db }, late);
    expect(rows(db, 'SELECT status, refunded_amount_minor FROM paypal_support_contributions')[0]).toEqual({ status: 'refunded', refunded_amount_minor: 500 });
  });
});

describe('operator reconciliation', () => {
  it('re-captures approved-but-uncaptured checkouts and expires stale abandoned ones', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db });
    // The operator mechanism only picks up stale rows (15 minutes without an update).
    db.db.exec("UPDATE paypal_support_checkouts SET updated_at = datetime('now', '-30 minutes')");
    const implementation = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const summary = await reconcilePaypalSupport({ env: { ...env, pure_link_db: db }, fetchImplementation: implementation, db, batchSize: 10 });
    expect(summary.examined).toBe(1);
    expect(summary.outcomes.completed).toBe(1);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(1);

    // Abandoned local checkout: expired after 30 days, record retained forever.
    const stale = new SqliteD1();
    await pendingCheckout({ db: stale });
    stale.db.exec("UPDATE paypal_support_checkouts SET created_at = '2020-01-01 00:00:00', updated_at = datetime('now', '-30 minutes')");
    const staleApi = scriptedFetch([]);
    const staleSummary = await reconcilePaypalSupport({ env: { ...env, pure_link_db: stale }, fetchImplementation: staleApi, batchSize: 10 });
    expect(staleSummary.expired).toBe(1);
    expect(rows(stale, "SELECT status FROM paypal_support_checkouts WHERE paypal_order_id = 'ORDER-1'")[0]).toEqual({ status: 'expired' });
    expect(rows(stale, 'SELECT COUNT(*) AS n FROM paypal_support_checkouts')[0].n).toBe(1);
    expect(paypalCalls(staleApi)).toHaveLength(0);
  });

  it('is unavailable without configuration and reports failed webhook events', async () => {
    const db = new SqliteD1();
    await expect(reconcilePaypalSupport({ env: {}, fetchImplementation: scriptedFetch([]), db })).rejects.toMatchObject({ code: 'supportUnavailable' });
    await pendingCheckout({ db });
    db.db.exec("UPDATE paypal_support_checkouts SET updated_at = datetime('now', '-30 minutes')");
    const implementation = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'APPROVED' })),
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    const summary = await reconcilePaypalSupport({ env: { ...env, PAYPAL_SUPPORT_CHECKOUT_ENABLED: 'false', pure_link_db: db }, fetchImplementation: implementation });
    // Reconciliation keeps working while new checkout is disabled.
    expect(summary.outcomes.completed).toBe(1);
    expect(summary.failedWebhookEvents).toBe(0);
  });
});

describe('public totals', () => {
  it('respects consent permutations and refunds, and never counts pending captures', async () => {
    const db = new SqliteD1();
    await pendingCheckout({ db, input: { publicName: true, displayName: 'nasa', publicMessage: false, message: '', publicAmount: true } });
    const api = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-1', status: 'COMPLETED', captures: [captureResource()] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-1&locale=en`), { ...env, pure_link_db: db }, api);
    let totals = await getPaypalSupportTotals(db);
    expect(totals).toMatchObject({ netUsdMinor: 500, contributionCount: 1 });
    expect(totals.publicSupporters).toEqual([{ name: 'nasa', message: '', amountText: '5.00', currency: 'USD' }]);
    // Private attribution shows nothing.
    await pendingCheckout({ db, amount: '10.00', input: { publicName: false, displayName: '', publicMessage: false, message: '', publicAmount: false }, orderId: 'ORDER-2' });
    const second = scriptedFetch([
      jsonResponse(orderBody({ id: 'ORDER-2', status: 'COMPLETED', amountMinor: '10.00', captures: [captureResource({ captureId: 'CAPTURE-2', orderId: 'ORDER-2', amountMinor: '10.00' })] })),
    ]);
    await handlePaypalSupportBrowserReturn(new URL(`${CANONICAL_ORIGIN}/api/payment-return/paypal-support?token=ORDER-2&locale=en`), { ...env, pure_link_db: db }, second);
    totals = await getPaypalSupportTotals(db);
    expect(totals.netUsdMinor).toBe(1500);
    expect(totals.contributionCount).toBe(2);
    expect(totals.publicSupporters).toHaveLength(1);
    // Partial refund reduces the public net amount for the consented row.
    const refund = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ amountMinor: '2.00' }))), { ...env, pure_link_db: db }, refund);
    totals = await getPaypalSupportTotals(db);
    expect(totals.netUsdMinor).toBe(1300);
    expect(totals.publicSupporters[0].amountText).toBe('3.00');
    // Full refund removes the supporter row but the records remain.
    const fullRefund = scriptedFetch([jsonResponse({ verification_status: 'SUCCESS' })]);
    await handlePaypalWebhook(webhookRequest(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource({ refundId: 'REFUND-FULL', amountMinor: '3.00' }))), { ...env, pure_link_db: db }, fullRefund);
    totals = await getPaypalSupportTotals(db);
    expect(totals.netUsdMinor).toBe(1000);
    expect(totals.contributionCount).toBe(1);
    expect(totals.publicSupporters).toHaveLength(0);
    expect(rows(db, 'SELECT COUNT(*) AS n FROM paypal_support_contributions')[0].n).toBe(2);
  });

  it('returns empty totals without a database', async () => {
    expect(await getPaypalSupportTotals(null)).toEqual({ netUsdMinor: 0, contributionCount: 0, publicSupporters: [] });
  });
});

describe('migration invariants at the SQLite edge', () => {
  it('enforces exact-currency, amount-range, and idempotency constraints', () => {
    const db = new SqliteD1();
    db.db.exec("INSERT INTO paypal_support_checkouts (id, paypal_request_id, expected_amount_minor, expected_currency, merchant_id) VALUES ('c1', 'cre-1', 500, 'USD', 'MER1')");
    db.db.exec("INSERT INTO paypal_support_checkouts (id, paypal_request_id, expected_amount_minor, expected_currency, merchant_id) VALUES ('c2', 'cre-2', 1000, 'USD', 'MER1')");
    // Currency pinned to USD.
    expect(() => db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-1', 'ORDER-1', 'c1', 'MER1', 500, 'EUR')")).toThrow(/CHECK constraint failed/);
    // Amount range enforced.
    expect(() => db.db.exec("INSERT INTO paypal_support_checkouts (id, paypal_request_id, expected_amount_minor, expected_currency, merchant_id) VALUES ('c3', 'cre-3', 299, 'USD', 'MER1')")).toThrow(/CHECK constraint failed/);
    expect(() => db.db.exec("INSERT INTO paypal_support_checkouts (id, paypal_request_id, expected_amount_minor, expected_currency, merchant_id) VALUES ('c3', 'cre-3', 30001, 'USD', 'MER1')")).toThrow(/CHECK constraint failed/);
    db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-1', 'ORDER-1', 'c1', 'MER1', 500, 'USD')");
    // Capture, order, and checkout identities are all unique.
    expect(() => db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-1', 'ORDER-9', 'c2', 'MER1', 500, 'USD')")).toThrow(/UNIQUE/);
    expect(() => db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-9', 'ORDER-1', 'c2', 'MER1', 500, 'USD')")).toThrow(/UNIQUE/);
    expect(() => db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-9', 'ORDER-9', 'c1', 'MER1', 500, 'USD')")).toThrow(/UNIQUE/);
    // Cumulative refunds above the capture are refused at the edge.
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r1', 'CAP-1', 'REF-1', 'refund:REF-1', 'refund', 300, 'USD')")).not.toThrow();
    // Refund operations are deduplicated by their stable request id.
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r5', 'CAP-1', 'REF-1', 'refund:REF-1', 'refund', 1, 'USD')")).toThrow(/UNIQUE/);
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r2', 'CAP-1', 'REF-2', 'refund:REF-2', 'refund', 201, 'USD')")).toThrow(/exceeds contribution amount/);
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r3', 'CAP-1', 'REF-3', 'refund:REF-3', 'refund', 200, 'USD')")).not.toThrow();
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r4', 'CAP-1', NULL, 'reversal:CAP-1', 'reversal', 1, 'USD')")).toThrow(/exceeds contribution amount/);
    // Refund rows for captures not yet recorded are retained (late events).
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r6', 'CAP-FUTURE', 'REF-6', 'refund:REF-6', 'refund', 100, 'USD')")).not.toThrow();
    // Unknown/foreign kind is refused.
    expect(() => db.db.exec("INSERT INTO paypal_support_refunds (id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency) VALUES ('r7', 'CAP-FUTURE', 'REF-7', 'refund:REF-7', 'chargeback', 100, 'USD')")).toThrow(/CHECK constraint failed/);
  });

  it('preserves foreign-key integrity for checkout references', () => {
    const db = new SqliteD1();
    expect(() => db.db.exec("INSERT INTO paypal_support_contributions (paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id, amount_minor, currency) VALUES ('CAP-1', 'ORDER-1', 'missing-checkout', 'MER1', 500, 'USD')")).toThrow(/FOREIGN KEY/);
  });
});
