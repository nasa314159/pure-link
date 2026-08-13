import { json } from './http.js';

export const CREEM_PRODUCT_300_ID = 'prod_4UdvN9knG2AzhhktS3Nwj9';
export const CREEM_CREDITS_300 = 300;
const DEFAULT_CREEM_API_BASE = 'https://api.creem.io';
const MAX_DAILY_FORMULA_ATTEMPTS = 100;

export class BillingError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'BillingError';
    this.status = status;
  }
}

export function isCheckoutConfigured(env) {
  return env.CREEM_LIVE_CHECKOUT_ENABLED === 'true'
    && Boolean(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET && configuredProductId(env));
}

export async function getCreditBalance(db, userId) {
  if (!db || !userId) return 0;
  const row = await db.prepare(`
    SELECT balance
    FROM formula_ai_credit_balances
    WHERE user_id = ?
  `).bind(userId).first();
  return Math.max(0, Number(row?.balance || 0));
}

export async function createCheckout({ requestUrl, user, env, fetchImplementation = fetch }) {
  const apiKey = String(env.CREEM_API_KEY || '');
  const productId = configuredProductId(env);
  if (!isCheckoutConfigured(env)) throw new BillingError('AI 額度結帳目前尚未開放。', 503);

  const requestId = crypto.randomUUID();
  await env.pure_link_db.prepare(`
    DELETE FROM billing_checkout_requests
    WHERE status != 'completed' AND created_at < datetime('now', '-30 days')
  `).run();
  await env.pure_link_db.prepare(`
    INSERT INTO billing_checkout_requests (id, user_id, provider, product_id, credits)
    VALUES (?, ?, 'creem', ?, ?)
  `).bind(requestId, user.id, productId, CREEM_CREDITS_300).run();

  const origin = String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, '');
  let response;
  try {
    response = await fetchImplementation(`${creemApiBase(env)}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        product_id: productId,
        request_id: requestId,
        units: 1,
        customer: { email: user.email },
        success_url: `${origin}/account?purchase=success`,
        metadata: {
          purelink_user_id: user.id,
          purelink_checkout_id: requestId,
          purelink_credits: CREEM_CREDITS_300,
        },
      }),
    });
  } catch {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw new BillingError('付款頁目前無法連線，請稍後再試。');
  }

  if (!response.ok) {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw new BillingError('付款平台暫時沒有建立結帳，請稍後再試。');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw new BillingError('付款平台回傳了無法辨識的結帳資料。');
  }
  const checkoutUrl = safeCheckoutUrl(payload?.checkout_url);
  if (!checkoutUrl) {
    await markCheckoutFailed(env.pure_link_db, requestId);
    throw new BillingError('付款平台沒有回傳安全的結帳地址。');
  }
  return { checkoutUrl };
}

export async function handleCreemWebhook(request, env) {
  if (!env.CREEM_WEBHOOK_SECRET) {
    return json({ error: 'Webhook is not configured.' }, { status: 503 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get('creem-signature') || '';
  if (!await verifyCreemSignature(rawBody, signature, env.CREEM_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  if (!validProviderId(event?.id, 'evt_') || typeof event?.eventType !== 'string') {
    return json({ error: 'Invalid webhook event.' }, { status: 400 });
  }

  if (event.eventType === 'checkout.completed') await recordCompletedCheckout(env.pure_link_db, event, env);
  else if (event.eventType === 'refund.created') await recordRefund(env.pure_link_db, event, false);
  else if (event.eventType === 'dispute.created') await recordRefund(env.pure_link_db, event, true);
  else await recordEvent(env.pure_link_db, event.id, event.eventType, null);

  return json({ received: true });
}

export async function consumeFormulaAllowance({ db, userId, isAdmin = false }) {
  const freeLimit = isAdmin ? MAX_DAILY_FORMULA_ATTEMPTS : 5;
  const dailyLimit = MAX_DAILY_FORMULA_ATTEMPTS;
  const usage = await db.prepare(`
    INSERT INTO formula_ai_daily_usage (user_id, usage_date, request_count, updated_at)
    VALUES (?, CURRENT_DATE, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, usage_date) DO UPDATE SET
      request_count = formula_ai_daily_usage.request_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE formula_ai_daily_usage.request_count < ?
    RETURNING request_count
  `).bind(userId, dailyLimit).first();

  if (!usage) throw new BillingError(`今天的 ${dailyLimit} 次安全上限已用完，請明天再試。`, 429);
  const count = Number(usage.request_count || 0);
  if (count <= freeLimit) {
    return { source: 'free', remaining: Math.max(0, freeLimit - count), limit: freeLimit };
  }

  const balance = await db.prepare(`
    UPDATE formula_ai_credit_balances
    SET balance = balance - 1,
        lifetime_consumed = lifetime_consumed + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND balance > 0
    RETURNING balance
  `).bind(userId).first();

  if (!balance) {
    await db.prepare(`
      UPDATE formula_ai_daily_usage
      SET request_count = MAX(0, request_count - 1), updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND usage_date = CURRENT_DATE
    `).bind(userId).run();
    throw new BillingError('今天的 5 次免費公式生成已用完；可以購買額度後繼續。', 402);
  }
  return { source: 'purchased', remaining: Number(balance.balance || 0), limit: dailyLimit };
}

export async function restorePurchasedFormulaCredit(db, userId) {
  await db.prepare(`
    UPDATE formula_ai_credit_balances
    SET balance = balance + 1,
        lifetime_consumed = MAX(0, lifetime_consumed - 1),
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).bind(userId).run();
}

async function recordCompletedCheckout(db, event, env) {
  const object = event.object || {};
  const order = object.order || {};
  const orderId = typeof order === 'string' ? order : order.id;
  const productId = typeof object.product === 'string' ? object.product : object.product?.id || order.product;
  const requestId = object.request_id || object.metadata?.purelink_checkout_id;
  if (object.status !== 'completed' || order.status !== 'paid') throw new BillingError('Checkout is not completed.', 400);
  if (!validProviderId(orderId, 'ord_') || !requestId || productId !== configuredProductId(env)) {
    throw new BillingError('Checkout does not match a PureLink product.', 400);
  }

  const checkout = await db.prepare(`
    SELECT id, user_id, product_id, credits, status
    FROM billing_checkout_requests
    WHERE id = ?
  `).bind(String(requestId)).first();
  if (!checkout || checkout.product_id !== productId || Number(checkout.credits) !== CREEM_CREDITS_300) {
    throw new BillingError('Checkout request was not created by PureLink.', 400);
  }

  const result = await db.prepare(`
    INSERT OR IGNORE INTO billing_orders (
      provider_order_id, provider_event_id, checkout_request_id, user_id,
      product_id, credits_total, amount, currency, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid')
  `).bind(
    orderId,
    event.id,
    checkout.id,
    checkout.user_id,
    productId,
    Number(checkout.credits),
    Math.max(0, Number(order.amount || 0)),
    String(order.currency || 'USD').slice(0, 8),
  ).run();

  if (changes(result) > 0) {
    await db.prepare(`
      UPDATE billing_checkout_requests
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(checkout.id).run();
  }
  await recordEvent(db, event.id, event.eventType, orderId);
}

async function recordRefund(db, event, disputed) {
  const object = event.object || {};
  const orderId = object.order?.id || object.transaction?.order;
  if (!validProviderId(orderId, 'ord_')) throw new BillingError('Refund does not identify an order.', 400);
  const order = await db.prepare(`
    SELECT provider_order_id, credits_total, credits_refunded, amount
    FROM billing_orders
    WHERE provider_order_id = ?
  `).bind(orderId).first();
  if (!order) {
    await recordEvent(db, event.id, event.eventType, orderId);
    return;
  }

  const amountPaid = Math.max(1, Number(object.transaction?.amount_paid || object.order?.amount_paid || order.amount || 1));
  const refundedAmount = disputed
    ? amountPaid
    : Math.max(0, Number(object.transaction?.refunded_amount || object.refund_amount || 0));
  const refundedCredits = disputed
    ? Number(order.credits_total)
    : Math.min(Number(order.credits_total), Math.floor(Number(order.credits_total) * refundedAmount / amountPaid));
  const status = disputed
    ? 'disputed'
    : refundedCredits >= Number(order.credits_total) ? 'refunded' : 'partially_refunded';

  await db.prepare(`
    UPDATE billing_orders
    SET credits_refunded = MAX(credits_refunded, ?),
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE provider_order_id = ?
  `).bind(refundedCredits, status, orderId).run();
  await recordEvent(db, event.id, event.eventType, orderId);
}

async function recordEvent(db, eventId, eventType, orderId) {
  await db.prepare(`
    INSERT OR IGNORE INTO billing_events (provider_event_id, event_type, provider_order_id)
    VALUES (?, ?, ?)
  `).bind(eventId, String(eventType).slice(0, 80), orderId || null).run();
}

async function markCheckoutFailed(db, requestId) {
  await db.prepare(`
    UPDATE billing_checkout_requests
    SET status = 'failed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(requestId).run();
}

export async function verifyCreemSignature(rawBody, signature, secret) {
  const normalized = String(signature || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized) || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected, normalized);
}

function configuredProductId(env) {
  return String(env.CREEM_PRODUCT_300_ID || CREEM_PRODUCT_300_ID);
}

function creemApiBase(env) {
  const value = String(env.CREEM_API_BASE || DEFAULT_CREEM_API_BASE).replace(/\/$/, '');
  return value === 'https://test-api.creem.io' ? value : DEFAULT_CREEM_API_BASE;
}

function safeCheckoutUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && (url.hostname === 'creem.io' || url.hostname.endsWith('.creem.io')) ? url.toString() : '';
  } catch {
    return '';
  }
}

function validProviderId(value, prefix) {
  return typeof value === 'string' && value.startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(value);
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
