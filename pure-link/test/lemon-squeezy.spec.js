import { describe, expect, it, vi } from 'vitest';
import { AI_CREDIT_PACKS } from '../src/credit-products.js';
import { createLemonCreditCheckout, createLemonSupportCheckout, getSupportTotals, handleLemonSqueezyWebhook, isLemonCheckoutConfigured, lemonVariantForPack, verifyLemonSqueezySignature } from '../src/lemon-squeezy.js';

describe('Lemon Squeezy billing and support', () => {
  it('is disabled by default and fails closed with incomplete configuration', () => {
    expect(isLemonCheckoutConfigured({})).toBe(false);
    expect(isLemonCheckoutConfigured({ ...billingEnv(new LemonDb()), LEMON_SQUEEZY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isLemonCheckoutConfigured({ ...billingEnv(new LemonDb()), LEMON_SQUEEZY_VARIANT_LARGE_ID: '' })).toBe(false);
    expect(isLemonCheckoutConfigured({ ...billingEnv(new LemonDb()), LEMON_SQUEEZY_VARIANT_LARGE_ID: '101' })).toBe(false);
  });

  it('maps each provider variant to exactly one canonical pack', () => {
    const env = billingEnv(new LemonDb());
    for (const [index, pack] of Object.values(AI_CREDIT_PACKS).entries()) expect(lemonVariantForPack(env, pack.id)).toBe(String(101 + index));
    expect(lemonVariantForPack(env, 'old-usd-tier')).toBe('');
  });

  it('creates a checkout from server-side pack identity only', async () => {
    const db = new LemonDb();
    const fetchImplementation = vi.fn().mockResolvedValue(lemonCheckoutResponse());
    const result = await createLemonCreditCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1', email: 'person@example.com' }, packId: 'standard', locale: 'en', env: billingEnv(db), fetchImplementation });
    expect(result.checkoutUrl).toBe('https://checkout.lemonsqueezy.com/buy/example');
    expect(db.checkout).toMatchObject({ kind: 'credit', user_id: 'user-1', pack_id: 'standard', variant_id: '102', credits: 400, status: 'pending' });
    const body = JSON.parse(fetchImplementation.mock.calls[0][1].body);
    expect(body.data.relationships.variant.data.id).toBe('102');
    expect(body.data.attributes.checkout_data.custom).toMatchObject({ purelink_kind: 'credit' });
    expect(JSON.stringify(db)).not.toContain('lemon-api-key');
  });

  it('rejects unsafe checkout URLs and invalid packs', async () => {
    await expect(createLemonCreditCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'u' }, packId: 'old-300', locale: 'en', env: billingEnv(new LemonDb()) })).rejects.toMatchObject({ code: 'billingPackInvalid' });
    await expect(createLemonCreditCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'u' }, packId: 'small', locale: 'en', env: billingEnv(new LemonDb()), fetchImplementation: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { attributes: { url: 'https://attacker.example/checkout' } } }))) })).rejects.toMatchObject({ code: 'billingProviderFailed' });
  });

  it('keeps Pay What You Want support anonymous by default and at zero credits', async () => {
    const db = new LemonDb();
    await createLemonSupportCheckout({ requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', env: billingEnv(db), displayName: 'not public', publicAttribution: false, fetchImplementation: vi.fn().mockResolvedValue(lemonCheckoutResponse()) });
    expect(db.checkout).toMatchObject({ kind: 'support', credits: 0, public_attribution: 0, public_display_name: null });
  });

  it('verifies raw HMAC payloads before D1 access', async () => {
    const body = '{"meta":{"event_name":"order_created"}}';
    const signature = await sign(body, 'webhook-secret');
    expect(await verifyLemonSqueezySignature(body, signature, 'webhook-secret')).toBe(true);
    const db = new LemonDb();
    expect((await handleLemonSqueezyWebhook(new Request('https://no-no.uk/api/webhooks/lemon-squeezy', { method: 'POST', body: '{}', headers: { 'x-signature': '0'.repeat(64) } }), billingEnv(db))).status).toBe(401);
    expect(db.queries).toBe(0);
  });

  it('rejects wrong stores and unknown variants without granting', async () => {
    const db = new LemonDb(); db.checkout = creditCheckout('small'); const env = billingEnv(db);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('101', db.checkout.id, '101', { store_id: 'other' }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('102', db.checkout.id, 'unknown'), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);
  });

  it('fulfills once and applies cumulative partial, additional, duplicate, and full refunds', async () => {
    const db = new LemonDb(); db.checkout = creditCheckout('small'); const env = billingEnv(db);
    const purchase = paidOrder('101', db.checkout.id, '101', { total: 500, currency: 'USD' });
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', purchase, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(150);
    await refund(env, '101', { status: 'partial_refund', total: 500, refunded_amount: 100, total_usd: 500, refunded_amount_usd: 100 });
    expect(db.creditOrder).toMatchObject({ credits_refunded: 30, refunded_amount_minor: 100, status: 'partial_refund' }); expect(db.balance).toBe(120);
    await refund(env, '101', { status: 'partial_refund', total: 500, refunded_amount: 100, total_usd: 500, refunded_amount_usd: 100 });
    expect(db.balance).toBe(120);
    await refund(env, '101', { status: 'partial_refund', total: 500, refunded_amount: 250, total_usd: 500, refunded_amount_usd: 250 });
    expect(db.creditOrder.credits_refunded).toBe(75); expect(db.balance).toBe(75);
    await refund(env, '101', { status: 'refunded', total: 500, refunded_amount: 500, total_usd: 500, refunded_amount_usd: 500 });
    expect(db.creditOrder.credits_refunded).toBe(150); expect(db.balance).toBe(0);
  });

  it('reconciles a verified full refund that arrives before order_created without leaving net credits', async () => {
    const db = new LemonDb(); db.checkout = creditCheckout('small'); const env = billingEnv(db);
    await refund(env, '301', { status: 'refunded', total: 500, refunded_amount: 500, total_usd: 500, refunded_amount_usd: 500 });
    expect(db.pendingRefund).toMatchObject({ provider_order_id: '301', refunded_amount_minor: 500 });
    expect(db.balance).toBe(0);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('301', db.checkout.id, '101', { total: 500, total_usd: 500 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.creditOrder).toMatchObject({ credits_refunded: 150, refunded_amount_minor: 500, status: 'refunded' });
    expect(db.balance).toBe(0);
    expect(db.pendingRefund).toBeNull();
  });

  it('keeps out-of-order partial refunds cumulative and idempotent before order_created', async () => {
    const db = new LemonDb(); db.checkout = creditCheckout('small'); const env = billingEnv(db);
    const first = { status: 'partial_refund', total: 500, refunded_amount: 100, total_usd: 500, refunded_amount_usd: 100 };
    await refund(env, '302', first);
    await refund(env, '302', first);
    await refund(env, '302', { ...first, refunded_amount: 250, refunded_amount_usd: 250 });
    expect(db.pendingRefund).toMatchObject({ refunded_amount_minor: 250, refunded_usd_amount_minor: 250, status: 'partial_refund' });
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('302', db.checkout.id, '101', { total: 500, total_usd: 500 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.creditOrder).toMatchObject({ credits_refunded: 75, refunded_amount_minor: 250, status: 'partial_refund' });
    expect(db.balance).toBe(75);
    expect(db.pendingRefund).toBeNull();
  });

  it('keeps support refunds separate and subtracts only cumulative provider USD refunds', async () => {
    const db = new LemonDb(); db.checkout = supportCheckout(); const env = billingEnv(db);
    await handleLemonSqueezyWebhook(await webhookRequest('order_created', paidOrder('199', db.checkout.id, '199', { total: 1200, total_usd: 1200 }), env.LEMON_SQUEEZY_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0); await expect(getSupportTotals(db)).resolves.toMatchObject({ netUsdMinor: 1200, contributionCount: 1, publicSupporters: ['nasa'] });
    await refund(env, '199', { status: 'partial_refund', total: 1200, refunded_amount: 300, total_usd: 1200, refunded_amount_usd: 300 });
    await expect(getSupportTotals(db)).resolves.toMatchObject({ netUsdMinor: 900, contributionCount: 1 });
    await refund(env, '199', { status: 'refunded', total: 1200, refunded_amount: 1200, total_usd: 1200, refunded_amount_usd: 1200 });
    await expect(getSupportTotals(db)).resolves.toMatchObject({ netUsdMinor: 0, contributionCount: 0, publicSupporters: [] });
  });
});

function billingEnv(db) { return { pure_link_db: db, LEMON_SQUEEZY_CHECKOUT_ENABLED: 'true', LEMON_SQUEEZY_API_KEY: 'lemon-api-key', LEMON_SQUEEZY_WEBHOOK_SECRET: 'webhook-secret', LEMON_SQUEEZY_STORE_ID: '1', LEMON_SQUEEZY_VARIANT_SMALL_ID: '101', LEMON_SQUEEZY_VARIANT_STANDARD_ID: '102', LEMON_SQUEEZY_VARIANT_LARGE_ID: '103', LEMON_SQUEEZY_SUPPORT_VARIANT_ID: '199', PUBLIC_ORIGIN: 'https://no-no.uk' }; }
function lemonCheckoutResponse() { return new Response(JSON.stringify({ data: { attributes: { url: 'https://checkout.lemonsqueezy.com/buy/example' } } }), { status: 201 }); }
function creditCheckout(packId) { const pack = AI_CREDIT_PACKS[packId]; const variants = { small: '101', standard: '102', large: '103' }; return { id: `checkout-${packId}`, kind: 'credit', user_id: 'user-1', pack_id: pack.id, variant_id: variants[pack.id], credits: pack.credits, public_attribution: 0, public_display_name: null, status: 'pending' }; }
function supportCheckout() { return { id: 'checkout-support', kind: 'support', user_id: null, pack_id: null, variant_id: '199', credits: 0, public_attribution: 1, public_display_name: 'nasa', status: 'pending' }; }
function paidOrder(orderId, checkoutId, variantId, attributes = {}) { return { meta: { custom_data: { purelink_checkout_id: checkoutId, purelink_kind: variantId === '199' ? 'support' : 'credit' } }, data: { type: 'orders', id: orderId, attributes: { status: 'paid', store_id: '1', variant_id: variantId, total: 500, currency: 'USD', ...attributes } } }; }
async function refund(env, orderId, attributes) { return handleLemonSqueezyWebhook(await webhookRequest('order_refunded', { data: { type: 'orders', id: orderId, attributes } }, env.LEMON_SQUEEZY_WEBHOOK_SECRET), env); }
async function webhookRequest(eventName, payload, secret) { const body = JSON.stringify(payload); return new Request('https://no-no.uk/api/webhooks/lemon-squeezy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-event-name': eventName, 'x-signature': await sign(body, secret) }, body }); }
async function sign(body, secret) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))); return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

class LemonDb {
  constructor() { this.checkout = null; this.creditOrder = null; this.supportOrder = null; this.pendingRefund = null; this.balance = 0; this.events = new Set(); this.queries = 0; }
  prepare(sql) {
    this.queries += 1; const normalized = sql.replace(/\s+/g, ' ').trim(); const db = this;
    return {
      async first() { const support = db.supportOrder?.status !== 'refunded' ? db.supportOrder : null; return { net_usd_minor: support ? support.usd_amount_minor - support.refunded_usd_amount_minor : 0, contribution_count: support ? 1 : 0, unconverted_count: support && support.usd_amount_minor == null ? 1 : 0 }; },
      async all() { const support = db.supportOrder?.status !== 'refunded' && db.supportOrder?.public_attribution === 1 ? db.supportOrder : null; return { results: support ? [{ public_display_name: support.public_display_name }] : [] }; },
      bind(...values) { return {
      async first() {
        if (normalized.startsWith('SELECT id, kind, user_id')) return db.checkout?.id === values[0] ? db.checkout : null;
        if (normalized.startsWith('SELECT provider_order_id, credits_total')) return db.creditOrder?.provider_order_id === values[0] ? db.creditOrder : null;
        if (normalized.startsWith('SELECT provider_order_id, amount_minor')) return db.supportOrder?.provider_order_id === values[0] ? db.supportOrder : null;
        if (normalized.startsWith('SELECT provider_order_id, status, total_minor')) return db.pendingRefund?.provider_order_id === values[0] ? db.pendingRefund : null;
        if (normalized.startsWith('SELECT COALESCE(SUM')) { const support = db.supportOrder?.status !== 'refunded' ? db.supportOrder : null; return { net_usd_minor: support ? support.usd_amount_minor - support.refunded_usd_amount_minor : 0, contribution_count: support ? 1 : 0, unconverted_count: support && support.usd_amount_minor == null ? 1 : 0 }; }
        return null;
      },
      async all() { const support = db.supportOrder?.status !== 'refunded' && db.supportOrder?.public_attribution === 1 ? db.supportOrder : null; return { results: support ? [{ public_display_name: support.public_display_name }] : [] }; },
      async run() {
        if (normalized.startsWith('INSERT INTO lemon_checkout_requests')) { db.checkout = normalized.includes("'credit'") ? { id: values[0], kind: 'credit', user_id: values[1], pack_id: values[2], variant_id: values[3], credits: values[4], public_attribution: 0, public_display_name: null, status: 'pending' } : { id: values[0], kind: 'support', user_id: null, pack_id: null, variant_id: values[1], credits: 0, public_attribution: values[2], public_display_name: values[3], status: 'pending' }; return changed(1); }
        if (normalized.startsWith('INSERT OR IGNORE INTO lemon_credit_orders')) { if (db.creditOrder) return changed(0); db.creditOrder = { provider_order_id: values[0], checkout_request_id: values[1], credits_total: values[5], amount_minor: values[6], credits_refunded: 0, refunded_amount_minor: 0, status: 'paid' }; db.balance += values[5]; return changed(1); }
        if (normalized.startsWith('INSERT OR IGNORE INTO lemon_support_contributions')) { if (db.supportOrder) return changed(0); db.supportOrder = { provider_order_id: values[0], amount_minor: values[2], usd_amount_minor: values[4], refunded_amount_minor: 0, refunded_usd_amount_minor: 0, public_attribution: values[5], public_display_name: values[6], status: 'paid' }; return changed(1); }
        if (normalized.startsWith('UPDATE lemon_checkout_requests')) { db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed'; return changed(1); }
        if (normalized.startsWith('UPDATE lemon_credit_orders')) { const next = Math.max(db.creditOrder.credits_refunded, values[0]); db.balance = Math.max(0, db.balance - (next - db.creditOrder.credits_refunded)); db.creditOrder.credits_refunded = next; db.creditOrder.refunded_amount_minor = Math.max(db.creditOrder.refunded_amount_minor, values[1]); db.creditOrder.status = db.creditOrder.refunded_amount_minor >= db.creditOrder.amount_minor ? 'refunded' : 'partial_refund'; return changed(1); }
        if (normalized.startsWith('UPDATE lemon_support_contributions')) { db.supportOrder.refunded_amount_minor = Math.max(db.supportOrder.refunded_amount_minor, values[0]); db.supportOrder.refunded_usd_amount_minor = Math.max(db.supportOrder.refunded_usd_amount_minor, values[1]); db.supportOrder.status = db.supportOrder.refunded_amount_minor >= db.supportOrder.amount_minor ? 'refunded' : 'partial_refund'; return changed(1); }
        if (normalized.startsWith('INSERT INTO lemon_pending_refunds')) { if (!db.pendingRefund) db.pendingRefund = { provider_order_id: values[0], status: values[1], total_minor: values[2], refunded_amount_minor: values[3], total_usd_minor: values[4], refunded_usd_amount_minor: values[5] }; else if (db.pendingRefund.total_minor === values[2] && db.pendingRefund.total_usd_minor === values[4]) { db.pendingRefund.refunded_amount_minor = Math.max(db.pendingRefund.refunded_amount_minor, values[3]); db.pendingRefund.refunded_usd_amount_minor = Math.max(db.pendingRefund.refunded_usd_amount_minor, values[5]); db.pendingRefund.status = db.pendingRefund.refunded_amount_minor >= db.pendingRefund.total_minor ? 'refunded' : 'partial_refund'; } return changed(1); }
        if (normalized.startsWith('DELETE FROM lemon_pending_refunds')) { if (db.pendingRefund?.provider_order_id === values[0]) db.pendingRefund = null; return changed(1); }
        if (normalized.startsWith('INSERT OR IGNORE INTO lemon_webhook_events')) { db.events.add(values[0]); return changed(1); }
        return changed(0);
      },
    }; } };
  }
}
function changed(count) { return { success: true, meta: { changes: count } }; }
