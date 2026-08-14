import { describe, expect, it, vi } from 'vitest';
import {
  CREDIT_TIERS,
  createCheckout,
  createSupportCheckout,
  getSupportTotals,
  handleLemonSqueezyWebhook,
  isCheckoutConfigured,
  isSupportConfigured,
  verifyLemonSqueezySignature,
} from '../src/billing.js';

describe('Lemon Squeezy billing and voluntary support', () => {
  it('uses only the three configured one-time credit tiers and creates checkout server-side', async () => {
    const db = new BillingDb();
    const fetchImplementation = vi.fn().mockResolvedValue(lemonCheckoutResponse());
    const result = await createCheckout({
      requestUrl: new URL('https://no-no.uk/en/account'),
      user: { id: 'user-1', email: 'person@example.com' },
      env: billingEnv(db),
      tier: 10,
      fetchImplementation,
    });

    expect(CREDIT_TIERS).toEqual({
      5: expect.objectContaining({ cents: 500, credits: 150 }),
      10: expect.objectContaining({ cents: 1000, credits: 400 }),
      20: expect.objectContaining({ cents: 2000, credits: 1000 }),
    });
    expect(result.checkoutUrl).toBe('https://checkout.lemonsqueezy.com/buy/example');
    expect(db.checkout).toMatchObject({ kind: 'credit', user_id: 'user-1', variant_id: '10', credits: 400, status: 'pending' });
    expect(db.balance).toBe(0);
    const [, options] = fetchImplementation.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(options.headers.authorization).toBe('Bearer lemon-api-key');
    expect(body).toMatchObject({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { email: 'person@example.com', custom: { purelink_kind: 'credit' } },
          product_options: { redirect_url: 'https://no-no.uk/account?purchase=success', enabled_variants: [10] },
        },
        relationships: { store: { data: { id: '1' } }, variant: { data: { id: '10' } } },
      },
    });
    expect(JSON.stringify(db)).not.toContain('lemon-api-key');
  });

  it('requires a complete Lemon Squeezy configuration for credits and a separate support variant', () => {
    const env = billingEnv(new BillingDb());
    expect(isCheckoutConfigured(env)).toBe(true);
    expect(isCheckoutConfigured({ ...env, LEMON_SQUEEZY_VARIANT_20_ID: '' })).toBe(false);
    expect(isCheckoutConfigured({ ...env, LEMON_SQUEEZY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isSupportConfigured(env)).toBe(true);
    expect(isSupportConfigured({ ...env, LEMON_SQUEEZY_SUPPORT_VARIANT_ID: '' })).toBe(false);
  });

  it('creates a separate anonymous Pay What You Want support checkout without product credits', async () => {
    const db = new BillingDb();
    await createSupportCheckout({
      requestUrl: new URL('https://no-no.uk/zh-Hant/support'),
      env: billingEnv(db),
      displayName: '  nasa  ',
      publicAttribution: true,
      fetchImplementation: vi.fn().mockResolvedValue(lemonCheckoutResponse()),
    });
    expect(db.checkout).toMatchObject({ kind: 'support', user_id: undefined, variant_id: '99', credits: 0, public_attribution: 1, public_display_name: 'nasa' });
    expect(db.balance).toBe(0);
  });

  it('verifies the raw request body with Lemon Squeezy HMAC-SHA256 signatures', async () => {
    const body = '{"meta":{"event_name":"order_created"}}';
    const signature = await sign(body, 'webhook-secret');
    expect(await verifyLemonSqueezySignature(body, signature, 'webhook-secret')).toBe(true);
    expect(await verifyLemonSqueezySignature(`${body} `, signature, 'webhook-secret')).toBe(false);
  });

  it('applies cumulative partial, additional, duplicate, and full credit refunds without double-revoking', async () => {
    const db = new BillingDb();
    db.checkout = creditCheckout();
    const env = billingEnv(db);
    const purchase = paidOrder('101', 'checkout-credit', '5');

    expect((await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env)).status).toBe(200);
    expect(db.balance).toBe(150);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(150);

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('101', { status: 'partial_refund', total: 500, refunded_amount: 100, total_usd: 500, refunded_amount_usd: 100 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(120);
    expect(db.creditOrder).toMatchObject({ credits_refunded: 30, refunded_amount_minor: 100, status: 'partial_refund' });

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('101', { status: 'partial_refund', total: 500, refunded_amount: 100, total_usd: 500, refunded_amount_usd: 100 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(120);
    expect(db.creditOrder.credits_refunded).toBe(30);

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('101', { status: 'partial_refund', total: 500, refunded_amount: 250, total_usd: 500, refunded_amount_usd: 250 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(75);
    expect(db.creditOrder.credits_refunded).toBe(75);

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('101', { status: 'refunded', total: 500, refunded_amount: 500, total_usd: 500, refunded_amount_usd: 500 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);
    expect(db.creditOrder.credits_refunded).toBe(150);
  });

  it('records voluntary support separately and subtracts only cumulative partial or full USD refunds', async () => {
    const db = new BillingDb();
    db.checkout = supportCheckout();
    const env = billingEnv(db);
    const purchase = paidOrder('102', 'checkout-support', '99', { total: 1200, total_usd: 1200 });

    await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);
    expect(db.supportOrder).toMatchObject({ provider_order_id: '102', usd_amount_minor: 1200, public_attribution: 1, public_display_name: 'nasa', status: 'paid' });
    await expect(getSupportTotals(db)).resolves.toEqual({ netUsdMinor: 1200, contributionCount: 1, hasUnconvertedContributions: false, publicSupporters: ['nasa'] });

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('102', { status: 'partial_refund', total: 1200, refunded_amount: 300, total_usd: 1200, refunded_amount_usd: 300 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.supportOrder).toMatchObject({ refunded_amount_minor: 300, refunded_usd_amount_minor: 300, status: 'partial_refund' });
    await expect(getSupportTotals(db)).resolves.toEqual({ netUsdMinor: 900, contributionCount: 1, hasUnconvertedContributions: false, publicSupporters: ['nasa'] });

    await handleLemonSqueezyWebhook(await webhookRequest('order_refunded', refundedOrder('102', { status: 'refunded', total: 1200, refunded_amount: 1200, total_usd: 1200, refunded_amount_usd: 1200 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    await expect(getSupportTotals(db)).resolves.toEqual({ netUsdMinor: 0, contributionCount: 0, hasUnconvertedContributions: false, publicSupporters: [] });
  });

  it('does not fulfill an unknown provider variant and rejects unsigned payloads before D1', async () => {
    const db = new BillingDb();
    db.checkout = creditCheckout();
    const env = billingEnv(db);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('103', 'checkout-credit', '88'), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);

    const untouched = new BillingDb();
    const response = await handleLemonSqueezyWebhook(new Request('https://no-no.uk/api/webhooks/lemon-squeezy', {
      method: 'POST', body: '{}', headers: { 'x-signature': '0'.repeat(64) },
    }), billingEnv(untouched));
    expect(response.status).toBe(401);
    expect(untouched.queries).toBe(0);
  });
});

function billingEnv(db) {
  return {
    pure_link_db: db,
    LEMON_SQUEEZY_CHECKOUT_ENABLED: 'true',
    LEMON_SQUEEZY_API_KEY: 'lemon-api-key',
    LEMON_SQUEEZY_WEBHOOK_SECRET: 'webhook-secret',
    LEMON_SQUEEZY_STORE_ID: '1',
    LEMON_SQUEEZY_VARIANT_5_ID: '5',
    LEMON_SQUEEZY_VARIANT_10_ID: '10',
    LEMON_SQUEEZY_VARIANT_20_ID: '20',
    LEMON_SQUEEZY_SUPPORT_VARIANT_ID: '99',
    PUBLIC_ORIGIN: 'https://no-no.uk',
  };
}

function lemonCheckoutResponse() {
  return new Response(JSON.stringify({ data: { attributes: { url: 'https://checkout.lemonsqueezy.com/buy/example' } } }), { status: 201 });
}

function creditCheckout() {
  return { id: 'checkout-credit', kind: 'credit', user_id: 'user-1', variant_id: '5', credits: 150, public_attribution: 0, public_display_name: null, status: 'pending' };
}

function supportCheckout() {
  return { id: 'checkout-support', kind: 'support', user_id: null, variant_id: '99', credits: 0, public_attribution: 1, public_display_name: 'nasa', status: 'pending' };
}

function paidOrder(orderId, checkoutId, variantId, attributes = {}) {
  return {
    meta: { custom_data: { purelink_checkout_id: checkoutId, purelink_kind: variantId === '99' ? 'support' : 'credit' } },
    data: { type: 'orders', id: orderId, attributes: { status: 'paid', store_id: '1', variant_id: variantId, total: 500, currency: 'USD', ...attributes } },
  };
}

function refundedOrder(orderId, attributes) {
  return { data: { type: 'orders', id: orderId, attributes } };
}

async function webhookRequest(eventName, payload, secret) {
  const body = JSON.stringify(payload);
  return new Request('https://no-no.uk/api/webhooks/lemon-squeezy', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-event-name': eventName, 'x-signature': await sign(body, secret) }, body,
  });
}

async function sign(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

class BillingDb {
  constructor() {
    this.checkout = null;
    this.creditOrder = null;
    this.supportOrder = null;
    this.balance = 0;
    this.events = new Set();
    this.queries = 0;
  }

  prepare(sql) {
    this.queries += 1;
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    const statement = {
      bind(...values) {
        return {
          async first() {
            if (normalized.startsWith('SELECT id, kind, user_id')) return db.checkout?.id === values[0] ? db.checkout : null;
            if (normalized.startsWith('SELECT provider_order_id, credits_total')) return db.creditOrder?.provider_order_id === values[0] ? db.creditOrder : null;
            if (normalized.startsWith('SELECT provider_order_id, amount_minor')) return db.supportOrder?.provider_order_id === values[0] ? db.supportOrder : null;
            if (normalized.startsWith('SELECT COALESCE(SUM')) {
              const paid = db.supportOrder?.status !== 'refunded' ? db.supportOrder : null;
              return { net_usd_minor: paid ? paid.usd_amount_minor - paid.refunded_usd_amount_minor : 0, contribution_count: paid ? 1 : 0, unconverted_count: paid && paid.usd_amount_minor == null ? 1 : 0 };
            }
            return null;
          },
          async run() {
            if (normalized.startsWith('INSERT INTO lemon_checkout_requests')) {
              db.checkout = normalized.includes("'credit'")
                ? { id: values[0], kind: 'credit', user_id: values[1], variant_id: values[2], credits: values[3], public_attribution: 0, public_display_name: null, status: 'pending' }
                : { id: values[0], kind: 'support', user_id: undefined, variant_id: values[1], credits: 0, public_attribution: values[2], public_display_name: values[3], status: 'pending' };
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO lemon_credit_orders')) {
              if (db.creditOrder) return changed(0);
              db.creditOrder = { provider_order_id: values[0], checkout_request_id: values[1], credits_total: values[4], amount_minor: values[5], credits_refunded: 0, refunded_amount_minor: 0, status: 'paid' };
              db.balance += values[4];
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO lemon_support_contributions')) {
              if (db.supportOrder) return changed(0);
              db.supportOrder = { provider_order_id: values[0], checkout_request_id: values[1], amount_minor: values[2], currency: values[3], usd_amount_minor: values[4], refunded_amount_minor: 0, refunded_usd_amount_minor: 0, public_attribution: values[5], public_display_name: values[6], status: 'paid' };
              return changed(1);
            }
            if (normalized.startsWith('UPDATE lemon_checkout_requests')) {
              if (db.checkout) db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed';
              return changed(1);
            }
            if (normalized.startsWith('UPDATE lemon_credit_orders')) {
              const nextRefunded = Math.max(db.creditOrder.credits_refunded, values[0]);
              db.balance = Math.max(0, db.balance - (nextRefunded - db.creditOrder.credits_refunded));
              db.creditOrder.credits_refunded = nextRefunded;
              db.creditOrder.refunded_amount_minor = Math.max(db.creditOrder.refunded_amount_minor, values[1]);
              db.creditOrder.status = db.creditOrder.refunded_amount_minor >= db.creditOrder.amount_minor ? 'refunded' : 'partial_refund';
              return changed(1);
            }
            if (normalized.startsWith('UPDATE lemon_support_contributions')) {
              if (db.supportOrder?.provider_order_id === values[3]) {
                db.supportOrder.refunded_amount_minor = Math.max(db.supportOrder.refunded_amount_minor, values[0]);
                db.supportOrder.refunded_usd_amount_minor = Math.max(db.supportOrder.refunded_usd_amount_minor, values[1]);
                db.supportOrder.status = db.supportOrder.refunded_amount_minor >= db.supportOrder.amount_minor ? 'refunded' : 'partial_refund';
              }
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO lemon_webhook_events')) {
              if (db.events.has(values[0])) return changed(0);
              db.events.add(values[0]);
              return changed(1);
            }
            return changed(0);
          },
          async all() {
            if (normalized.startsWith('SELECT public_display_name')) {
              const paid = db.supportOrder?.status !== 'refunded' && db.supportOrder.public_attribution === 1 && db.supportOrder.public_display_name;
              return { results: paid ? [{ public_display_name: db.supportOrder.public_display_name }] : [] };
            }
            return { results: [] };
          },
        };
      },
    };
    statement.first = async () => {
      if (normalized.startsWith('SELECT COALESCE(SUM')) {
        const paid = db.supportOrder?.status !== 'refunded' ? db.supportOrder : null;
        return { net_usd_minor: paid ? paid.usd_amount_minor - paid.refunded_usd_amount_minor : 0, contribution_count: paid ? 1 : 0, unconverted_count: paid && paid.usd_amount_minor == null ? 1 : 0 };
      }
      return null;
    };
    statement.all = async () => {
      if (normalized.startsWith('SELECT public_display_name')) {
        const paid = db.supportOrder?.status !== 'refunded' && db.supportOrder.public_attribution === 1 && db.supportOrder.public_display_name;
        return { results: paid ? [{ public_display_name: db.supportOrder.public_display_name }] : [] };
      }
      return { results: [] };
    };
    return statement;
  }
}

function changed(count) {
  return { success: true, meta: { changes: count } };
}
