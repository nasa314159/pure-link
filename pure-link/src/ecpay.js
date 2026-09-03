import { getAiCreditPack } from './credit-products.js';
import { redirect, text } from './http.js';
import { PaymentError } from './payment-error.js';

export const ECPAY_STAGE_ENDPOINT = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
export const ECPAY_PRODUCTION_ENDPOINT = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
export const CANONICAL_PUBLIC_ORIGIN = 'https://no-no.uk';

export function isEcpayCheckoutConfigured(env) {
  const environment = String(env?.ECPAY_ENVIRONMENT || '');
  const origin = configuredPublicOrigin(env);
  return env?.ECPAY_CHECKOUT_ENABLED === 'true'
    && /^[0-9]{1,10}$/.test(String(env?.ECPAY_MERCHANT_ID || ''))
    && validSecret(env?.ECPAY_HASH_KEY)
    && validSecret(env?.ECPAY_HASH_IV)
    && ['stage', 'production'].includes(environment)
    && Boolean(origin)
    && (environment !== 'production' || origin === CANONICAL_PUBLIC_ORIGIN);
}

export async function createEcpayCheckout({ requestUrl, user, packId, locale, env }) {
  if (!isEcpayCheckoutConfigured(env)) throw new PaymentError('billingUnavailable');
  const pack = getAiCreditPack(packId);
  if (!pack) throw new PaymentError('billingPackInvalid', 400);
  const id = crypto.randomUUID();
  let merchantTradeNo = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    merchantTradeNo = createMerchantTradeNo();
    try {
      await env.pure_link_db.prepare(`
        INSERT INTO ecpay_checkout_requests (id, merchant_trade_no, user_id, pack_id, expected_amount, expected_credits)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, merchantTradeNo, user.id, pack.id, pack.priceTwd, pack.credits).run();
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 2) throw error;
    }
  }

  const origin = publicOrigin(requestUrl, env);
  const resultLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
  const fields = {
    MerchantID: String(env.ECPAY_MERCHANT_ID),
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: ecpayTradeDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: String(pack.priceTwd),
    TradeDesc: 'PureLink AI formula credits',
    ItemName: `PureLink AI formula drafts x ${pack.credits}`,
    ReturnURL: `${origin}/api/webhooks/ecpay`,
    // ECPay POSTs browser results here. This route intentionally redirects
    // without inspecting the payload; only ReturnURL can fulfill an order.
    OrderResultURL: `${origin}/api/payment-return/ecpay?locale=${resultLocale}`,
    // Some ECPay payment methods use a client-back flow instead of OrderResultURL.
    ClientBackURL: `${origin}/${resultLocale}/account?purchase=pending`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };
  return { provider: 'ecpay', action: ecpayEndpoint(env), fields: { ...fields, CheckMacValue: await createCheckMacValue(fields, env) } };
}

// This browser-facing endpoint is deliberately non-authoritative. Do not read
// its body or use its fields for fulfillment; ReturnURL is the sole ECPay
// fulfillment boundary and validates its own signed callback.
export function handleEcpayBrowserReturn(requestUrl) {
  const locale = requestUrl.searchParams.get('locale') === 'zh-Hant' ? 'zh-Hant' : 'en';
  return redirect(`/${locale}/account?purchase=pending`, 303);
}

export async function handleEcpayCallback(request, env) {
  if (!isEcpayCheckoutConfigured(env)) return text('0|FAIL', { status: 503 });
  const fields = Object.fromEntries(await request.formData());
  if (!await verifyCheckMacValue(fields, env)) return text('0|FAIL', { status: 400 });
  if (String(fields.MerchantID) !== String(env.ECPAY_MERCHANT_ID)) return text('0|FAIL', { status: 400 });
  const merchantTradeNo = String(fields.MerchantTradeNo || '');
  const tradeAmount = parseAmount(fields.TradeAmt);
  if (!/^[A-Za-z0-9]{1,20}$/.test(merchantTradeNo) || tradeAmount == null) return text('0|FAIL', { status: 400 });
  const checkout = await env.pure_link_db.prepare(`
    SELECT id, user_id, pack_id, expected_amount, expected_credits, status
    FROM ecpay_checkout_requests WHERE merchant_trade_no = ?
  `).bind(merchantTradeNo).first();
  if (!checkout || !['pending', 'completed', 'failed'].includes(checkout.status) || tradeAmount !== Number(checkout.expected_amount)) return text('0|FAIL', { status: 400 });
  // A simulated callback and an authenticated payment failure are received safely,
  // but neither represents a fulfillment event.
  if (String(fields.SimulatePaid || '') !== '0') return text('1|OK');
  if (String(fields.RtnCode) !== '1') {
    if (checkout.status === 'pending') {
      await env.pure_link_db.prepare("UPDATE ecpay_checkout_requests SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(checkout.id).run();
    }
    return text('1|OK');
  }
  const tradeNo = String(fields.TradeNo || '');
  if (!/^[A-Za-z0-9]{1,64}$/.test(tradeNo) || checkout.status === 'failed') return text('0|FAIL', { status: 400 });
  if (checkout.status === 'completed') {
    const order = await env.pure_link_db.prepare('SELECT trade_no FROM ecpay_orders WHERE checkout_request_id = ?').bind(checkout.id).first();
    return order?.trade_no === tradeNo ? text('1|OK') : text('0|FAIL', { status: 400 });
  }
  const pack = getAiCreditPack(checkout.pack_id);
  if (!pack || pack.credits !== Number(checkout.expected_credits) || pack.priceTwd !== Number(checkout.expected_amount)) return text('0|FAIL', { status: 400 });
  const result = await env.pure_link_db.prepare(`
    INSERT OR IGNORE INTO ecpay_orders (merchant_trade_no, trade_no, checkout_request_id, user_id, pack_id, amount, credits_total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')
  `).bind(merchantTradeNo, tradeNo, checkout.id, checkout.user_id, pack.id, pack.priceTwd, pack.credits).run();
  if (changes(result) === 0) {
    const order = await env.pure_link_db.prepare('SELECT trade_no FROM ecpay_orders WHERE checkout_request_id = ?').bind(checkout.id).first();
    if (order?.trade_no !== tradeNo) return text('0|FAIL', { status: 400 });
  }
  await env.pure_link_db.prepare("UPDATE ecpay_checkout_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(checkout.id).run();
  return text('1|OK');
}

export async function createCheckMacValue(fields, env) {
  const payload = Object.entries(fields)
    .filter(([key]) => key !== 'CheckMacValue')
    .sort(([left], [right]) => compareFieldNames(left, right))
    .map(([key, value]) => `${key}=${value ?? ''}`).join('&');
  const encoded = ecpayUrlEncode(`HashKey=${env.ECPAY_HASH_KEY}&${payload}&HashIV=${env.ECPAY_HASH_IV}`).toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function verifyCheckMacValue(fields, env) {
  const provided = String(fields.CheckMacValue || '').toUpperCase();
  return /^[A-F0-9]{64}$/.test(provided) && constantTimeEqual(await createCheckMacValue(fields, env), provided);
}

export function createMerchantTradeNo(now = Date.now(), random = Math.random) {
  const timestamp = Math.max(0, Math.floor(now)).toString(36).toUpperCase();
  const randomValue = Math.min(0.9999999999999999, Math.max(0, Number(random()) || 0));
  const randomPart = Math.floor(randomValue * (36 ** 9)).toString(36).toUpperCase().padStart(9, '0');
  return `PL${timestamp}${randomPart}`.slice(0, 20);
}

// Workers use UTC; explicitly shift before using UTC getters instead of relying
// on whatever local timezone the runtime happens to have.
export function ecpayTradeDate(date) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${taipei.getUTCFullYear()}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
}

function ecpayUrlEncode(value) { return encodeURIComponent(value).replace(/%20/g, '+').replace(/%21/g, '!').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2A/g, '*').replace(/%2D/g, '-').replace(/%2E/g, '.').replace(/%5F/g, '_'); }
export function ecpayEndpoint(env) { return String(env?.ECPAY_ENVIRONMENT) === 'production' ? ECPAY_PRODUCTION_ENDPOINT : ECPAY_STAGE_ENDPOINT; }
function publicOrigin(requestUrl, env) { return configuredPublicOrigin(env) || requestUrl.origin; }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
function constantTimeEqual(left, right) { if (left.length !== right.length) return false; let result = 0; for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i); return result === 0; }
function validSecret(value) { return typeof value === 'string' && value.length === 16; }
function configuredPublicOrigin(env) {
  try {
    const url = new URL(String(env?.PUBLIC_ORIGIN || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch {
    return '';
  }
}
function parseAmount(value) {
  const stringValue = String(value ?? '');
  if (!/^\d+$/.test(stringValue)) return null;
  const amount = Number(stringValue);
  return Number.isSafeInteger(amount) ? amount : null;
}
function isUniqueConstraintError(error) { return /unique|constraint/i.test(String(error?.message || error)); }
function compareFieldNames(left, right) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}
