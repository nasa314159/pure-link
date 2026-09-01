import { getAiCreditPack, listAiCreditPacks } from './credit-products.js';
import { json } from './http.js';
import { PaymentError } from './payment-error.js';

const LEMON_API_BASE = 'https://api.lemonsqueezy.com/v1';

export function isLemonCheckoutConfigured(env) {
  const variants = listAiCreditPacks().map((pack) => lemonVariantForPack(env, pack.id));
  return env.LEMON_SQUEEZY_CHECKOUT_ENABLED === 'true'
    && Boolean(env.LEMON_SQUEEZY_API_KEY && env.LEMON_SQUEEZY_WEBHOOK_SECRET)
    && validLemonId(env.LEMON_SQUEEZY_STORE_ID)
    && variants.every(Boolean)
    && new Set(variants).size === variants.length;
}

export function isLemonSupportConfigured(env) {
  return env.LEMON_SQUEEZY_CHECKOUT_ENABLED === 'true'
    && Boolean(env.LEMON_SQUEEZY_API_KEY && env.LEMON_SQUEEZY_WEBHOOK_SECRET)
    && validLemonId(env.LEMON_SQUEEZY_STORE_ID)
    && validLemonId(env.LEMON_SQUEEZY_SUPPORT_VARIANT_ID);
}

export async function createLemonCreditCheckout({ requestUrl, user, packId, locale, env, fetchImplementation = fetch }) {
  if (!isLemonCheckoutConfigured(env)) throw new PaymentError('billingUnavailable');
  const pack = getAiCreditPack(packId);
  const variantId = pack && lemonVariantForPack(env, pack.id);
  if (!pack || !variantId) throw new PaymentError('billingPackInvalid', 400);
  const requestId = crypto.randomUUID();
  await env.pure_link_db.prepare(`
    INSERT INTO lemon_checkout_requests (id, kind, user_id, pack_id, variant_id, credits)
    VALUES (?, 'credit', ?, ?, ?, ?)
  `).bind(requestId, user.id, pack.id, variantId, pack.credits).run();
  try {
    return await createLemonCheckout({
      requestUrl, env, variantId,
      custom: { purelink_checkout_id: requestId, purelink_kind: 'credit' },
      redirectPath: `/${locale}/account?purchase=pending`,
      prefillEmail: user.email,
      fetchImplementation,
    });
  } catch (error) {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw error;
  }
}

// Support stays deliberately outside the credit catalog and has no user_id or credits.
export async function createLemonSupportCheckout({ requestUrl, locale, env, displayName = '', publicAttribution = false, fetchImplementation = fetch }) {
  if (!isLemonSupportConfigured(env)) throw new PaymentError('supportUnavailable');
  const requestId = crypto.randomUUID();
  const attribution = publicAttribution === true || String(publicAttribution) === 'true';
  const safeName = attribution ? normalizeDisplayName(displayName) : null;
  await env.pure_link_db.prepare(`
    INSERT INTO lemon_checkout_requests (id, kind, variant_id, credits, public_attribution, public_display_name)
    VALUES (?, 'support', ?, 0, ?, ?)
  `).bind(requestId, String(env.LEMON_SQUEEZY_SUPPORT_VARIANT_ID), attribution ? 1 : 0, safeName).run();
  try {
    return await createLemonCheckout({
      requestUrl, env, variantId: String(env.LEMON_SQUEEZY_SUPPORT_VARIANT_ID),
      custom: { purelink_checkout_id: requestId, purelink_kind: 'support' },
      redirectPath: `/${locale}/support?thanks=1`,
      fetchImplementation,
    });
  } catch (error) {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw error;
  }
}

export async function getSupportTotals(db) {
  if (!db) return { netUsdMinor: 0, contributionCount: 0, hasUnconvertedContributions: false, publicSupporters: [] };
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status != 'refunded' THEN MAX(0, COALESCE(usd_amount_minor, 0) - refunded_usd_amount_minor) ELSE 0 END), 0) AS net_usd_minor,
      COALESCE(SUM(CASE WHEN status != 'refunded' THEN 1 ELSE 0 END), 0) AS contribution_count,
      COALESCE(SUM(CASE WHEN status != 'refunded' AND usd_amount_minor IS NULL THEN 1 ELSE 0 END), 0) AS unconverted_count
    FROM lemon_support_contributions
  `).first();
  const publicSupporters = await db.prepare(`
    SELECT public_display_name FROM lemon_support_contributions
    WHERE status != 'refunded' AND public_attribution = 1 AND public_display_name IS NOT NULL
    ORDER BY created_at DESC LIMIT 24
  `).all();
  return {
    netUsdMinor: Math.max(0, Number(row?.net_usd_minor || 0)),
    contributionCount: Math.max(0, Number(row?.contribution_count || 0)),
    hasUnconvertedContributions: Number(row?.unconverted_count || 0) > 0,
    publicSupporters: (publicSupporters?.results || []).map((item) => String(item?.public_display_name || '')).filter(Boolean),
  };
}

export async function handleLemonSqueezyWebhook(request, env) {
  if (!lemonWebhookConfigured(env)) return json({ error: 'Webhook is not configured.' }, { status: 503 });
  const rawBody = await request.text();
  if (!await verifyLemonSqueezySignature(rawBody, request.headers.get('x-signature'), env.LEMON_SQUEEZY_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: 'Invalid webhook payload.' }, { status: 400 }); }
  const eventName = String(request.headers.get('x-event-name') || payload?.meta?.event_name || '');
  const orderId = String(payload?.data?.id || '');
  if (!['order_created', 'order_refunded'].includes(eventName) || payload?.data?.type !== 'orders' || !validLemonId(orderId)) {
    return json({ error: 'Unsupported webhook event.' }, { status: 400 });
  }
  if (eventName === 'order_created') await recordPaidOrder(env.pure_link_db, payload, env, orderId);
  else await recordRefund(env.pure_link_db, payload, orderId);
  const refundKey = eventName === 'order_refunded' ? `:${String(payload?.data?.attributes?.refunded_amount || '')}` : '';
  await recordWebhookEvent(env.pure_link_db, `lemon:${orderId}:${eventName}${refundKey}`, eventName, orderId);
  return json({ received: true });
}

export async function verifyLemonSqueezySignature(rawBody, signature, secret) {
  const normalized = String(signature || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized) || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected, normalized);
}

export function lemonVariantForPack(env, packId) {
  const pack = getAiCreditPack(packId);
  const value = pack && env[`LEMON_SQUEEZY_VARIANT_${pack.id.toUpperCase()}_ID`];
  return validLemonId(value) ? String(value) : '';
}

function lemonPackForVariant(env, variantId) {
  return listAiCreditPacks().find((pack) => lemonVariantForPack(env, pack.id) === String(variantId)) || null;
}

function lemonWebhookConfigured(env) {
  return Boolean(env.LEMON_SQUEEZY_WEBHOOK_SECRET && validLemonId(env.LEMON_SQUEEZY_STORE_ID));
}

async function createLemonCheckout({ requestUrl, env, variantId, custom, redirectPath, prefillEmail, fetchImplementation }) {
  let response;
  try {
    response = await fetchImplementation(`${LEMON_API_BASE}/checkouts`, {
      method: 'POST',
      headers: { accept: 'application/vnd.api+json', 'content-type': 'application/vnd.api+json', authorization: `Bearer ${env.LEMON_SQUEEZY_API_KEY}` },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: { ...(prefillEmail ? { email: prefillEmail } : {}), custom },
            product_options: { redirect_url: `${publicOrigin(requestUrl, env)}${redirectPath}`, enabled_variants: [Number(variantId)] },
          },
          relationships: {
            store: { data: { type: 'stores', id: String(env.LEMON_SQUEEZY_STORE_ID) } },
            variant: { data: { type: 'variants', id: String(variantId) } },
          },
        },
      }),
    });
  } catch { throw new PaymentError('billingProviderUnavailable', 502); }
  if (!response.ok) throw new PaymentError('billingProviderFailed', 502);
  let payload;
  try { payload = await response.json(); } catch { throw new PaymentError('billingProviderFailed', 502); }
  const checkoutUrl = safeCheckoutUrl(payload?.data?.attributes?.url);
  if (!checkoutUrl) throw new PaymentError('billingProviderFailed', 502);
  return { provider: 'lemon', checkoutUrl };
}

async function recordPaidOrder(db, payload, env, orderId) {
  const attributes = payload.data.attributes || {};
  const custom = payload.meta?.custom_data || {};
  const requestId = String(custom.purelink_checkout_id || '');
  const variantId = String(attributes.variant_id || attributes.first_order_item?.variant_id || '');
  if (attributes.status !== 'paid' || !requestId || !validLemonId(variantId) || String(attributes.store_id) !== String(env.LEMON_SQUEEZY_STORE_ID)) return;
  const checkout = await db.prepare(`
    SELECT id, kind, user_id, pack_id, variant_id, credits, public_attribution, public_display_name, status
    FROM lemon_checkout_requests WHERE id = ?
  `).bind(requestId).first();
  if (!checkout || checkout.status !== 'pending' || checkout.variant_id !== variantId) return;
  if (checkout.kind === 'credit') {
    const pack = lemonPackForVariant(env, variantId);
    if (!pack || !checkout.user_id || checkout.pack_id !== pack.id || Number(checkout.credits) !== pack.credits) return;
    const result = await db.prepare(`
      INSERT OR IGNORE INTO lemon_credit_orders (provider_order_id, checkout_request_id, user_id, pack_id, variant_id, credits_total, amount_minor, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `).bind(orderId, checkout.id, checkout.user_id, pack.id, variantId, pack.credits, nonNegativeInteger(attributes.total), String(attributes.currency || 'USD').slice(0, 8)).run();
    if (changes(result) > 0) await markCheckoutCompleted(db, checkout.id);
    return;
  }
  if (checkout.kind !== 'support' || variantId !== String(env.LEMON_SQUEEZY_SUPPORT_VARIANT_ID || '')) return;
  const result = await db.prepare(`
    INSERT OR IGNORE INTO lemon_support_contributions (
      provider_order_id, checkout_request_id, amount_minor, currency, usd_amount_minor,
      public_attribution, public_display_name, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')
  `).bind(orderId, checkout.id, nonNegativeInteger(attributes.total), String(attributes.currency || '').slice(0, 8), providerUsdAmount(attributes), Number(checkout.public_attribution) === 1 ? 1 : 0, Number(checkout.public_attribution) === 1 ? checkout.public_display_name || null : null).run();
  if (changes(result) > 0) await markCheckoutCompleted(db, checkout.id);
}

// Lemon sends cumulative totals. The stored maxima and DB triggers revoke only
// the delta, making repeat and out-of-order notifications safe.
async function recordRefund(db, payload, orderId) {
  const attributes = payload?.data?.attributes || {};
  const status = String(attributes.status || '');
  if (!['partial_refund', 'refunded'].includes(status)) return;
  const total = nonNegativeInteger(attributes.total);
  const refundedAmount = nonNegativeInteger(attributes.refunded_amount);
  const credit = await db.prepare('SELECT provider_order_id, credits_total, credits_refunded, amount_minor FROM lemon_credit_orders WHERE provider_order_id = ?').bind(orderId).first();
  if (credit) {
    if (!validCumulativeRefund(total, refundedAmount, credit.amount_minor)) return;
    const cumulativeAmount = status === 'refunded' ? Number(credit.amount_minor) : refundedAmount;
    const cumulativeCredits = refundedCredits(credit.credits_total, credit.amount_minor, cumulativeAmount);
    await db.prepare(`
      UPDATE lemon_credit_orders
      SET credits_refunded = MAX(credits_refunded, ?), refunded_amount_minor = MAX(refunded_amount_minor, ?),
          status = CASE WHEN MAX(refunded_amount_minor, ?) >= amount_minor THEN 'refunded' ELSE 'partial_refund' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE provider_order_id = ?
    `).bind(cumulativeCredits, cumulativeAmount, cumulativeAmount, orderId).run();
    return;
  }
  const support = await db.prepare('SELECT provider_order_id, amount_minor, usd_amount_minor FROM lemon_support_contributions WHERE provider_order_id = ?').bind(orderId).first();
  if (!support || !validCumulativeRefund(total, refundedAmount, support.amount_minor)) return;
  const cumulativeAmount = status === 'refunded' ? Number(support.amount_minor) : refundedAmount;
  const refundedUsd = cumulativeUsdRefund(attributes, support.usd_amount_minor, status);
  if (refundedUsd == null) return;
  await db.prepare(`
    UPDATE lemon_support_contributions
    SET refunded_amount_minor = MAX(refunded_amount_minor, ?), refunded_usd_amount_minor = MAX(refunded_usd_amount_minor, ?),
        status = CASE WHEN MAX(refunded_amount_minor, ?) >= amount_minor THEN 'refunded' ELSE 'partial_refund' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE provider_order_id = ?
  `).bind(cumulativeAmount, refundedUsd, cumulativeAmount, orderId).run();
}

async function markCheckoutCompleted(db, requestId) { await db.prepare("UPDATE lemon_checkout_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(requestId).run(); }
async function markCheckoutFailed(db, requestId) { await db.prepare("UPDATE lemon_checkout_requests SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(requestId).run(); }
async function recordWebhookEvent(db, eventKey, eventName, orderId) { await db.prepare('INSERT OR IGNORE INTO lemon_webhook_events (event_key, event_name, provider_order_id) VALUES (?, ?, ?)').bind(eventKey, eventName, orderId).run(); }
function normalizeDisplayName(value) { const name = String(value || '').trim().replace(/\s+/g, ' '); return name ? name.slice(0, 60) : null; }
function providerUsdAmount(attributes) { const value = Number(attributes?.total_usd); return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function validCumulativeRefund(total, refundedAmount, storedAmount) { return Number.isSafeInteger(total) && Number.isSafeInteger(refundedAmount) && total === Number(storedAmount) && refundedAmount <= total; }
function refundedCredits(creditsTotal, amountMinor, refundedAmount) { if (!amountMinor || refundedAmount >= amountMinor) return Number(creditsTotal); return Math.min(Number(creditsTotal), Math.floor((Number(creditsTotal) * refundedAmount) / amountMinor)); }
function cumulativeUsdRefund(attributes, storedUsdAmount, status) { if (storedUsdAmount == null) return 0; const totalUsd = nonNegativeInteger(attributes.total_usd); const refundedUsd = nonNegativeInteger(attributes.refunded_amount_usd); if (totalUsd !== Number(storedUsdAmount) || refundedUsd > totalUsd) return null; return status === 'refunded' ? totalUsd : refundedUsd; }
function nonNegativeInteger(value) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0 ? number : 0; }
function publicOrigin(requestUrl, env) { return String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, ''); }
function safeCheckoutUrl(value) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && url.hostname.endsWith('.lemonsqueezy.com') ? url.toString() : ''; } catch { return ''; } }
function validLemonId(value) { return /^[1-9][0-9]{0,15}$/.test(String(value || '')); }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
function constantTimeEqual(left, right) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
