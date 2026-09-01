import { getAiCreditPack } from './credit-products.js';
import { text } from './http.js';
import { PaymentError } from './payment-error.js';

const STAGE_ENDPOINT = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
const PRODUCTION_ENDPOINT = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

export function isEcpayCheckoutConfigured(env) {
  return env.ECPAY_CHECKOUT_ENABLED === 'true'
    && /^[0-9A-Za-z]{1,10}$/.test(String(env.ECPAY_MERCHANT_ID || ''))
    && Boolean(env.ECPAY_HASH_KEY && env.ECPAY_HASH_IV)
    && ['stage', 'production'].includes(String(env.ECPAY_ENVIRONMENT || 'stage'));
}

export async function createEcpayCheckout({ requestUrl, user, packId, locale, env }) {
  if (!isEcpayCheckoutConfigured(env)) throw new PaymentError('billingUnavailable');
  const pack = getAiCreditPack(packId);
  if (!pack) throw new PaymentError('billingPackInvalid', 400);
  const id = crypto.randomUUID();
  const merchantTradeNo = createMerchantTradeNo();
  await env.pure_link_db.prepare(`
    INSERT INTO ecpay_checkout_requests (id, merchant_trade_no, user_id, pack_id, expected_amount, expected_credits)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, merchantTradeNo, user.id, pack.id, pack.priceTwd, pack.credits).run();

  const origin = publicOrigin(requestUrl, env);
  const fields = {
    MerchantID: String(env.ECPAY_MERCHANT_ID),
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: ecpayTradeDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: String(pack.priceTwd),
    TradeDesc: 'PureLink AI formula credits',
    ItemName: `PureLink AI formula drafts x ${pack.credits}`,
    ReturnURL: `${origin}/api/webhooks/ecpay`,
    OrderResultURL: `${origin}/${locale}/account?purchase=pending`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };
  return { provider: 'ecpay', action: ecpayEndpoint(env), fields: { ...fields, CheckMacValue: await createCheckMacValue(fields, env) } };
}

export async function handleEcpayCallback(request, env) {
  if (!isEcpayCheckoutConfigured(env)) return text('0|FAIL', { status: 503 });
  const fields = Object.fromEntries(await request.formData());
  if (!await verifyCheckMacValue(fields, env)) return text('0|FAIL', { status: 400 });
  if (String(fields.MerchantID) !== String(env.ECPAY_MERCHANT_ID)) return text('0|FAIL', { status: 400 });
  const merchantTradeNo = String(fields.MerchantTradeNo || '');
  if (!/^[A-Za-z0-9]{1,20}$/.test(merchantTradeNo) || !/^\d+$/.test(String(fields.TradeAmt || ''))) return text('0|FAIL', { status: 400 });
  const checkout = await env.pure_link_db.prepare(`
    SELECT id, user_id, pack_id, expected_amount, expected_credits, status
    FROM ecpay_checkout_requests WHERE merchant_trade_no = ?
  `).bind(merchantTradeNo).first();
  if (!checkout || !['pending', 'completed', 'failed'].includes(checkout.status) || Number(fields.TradeAmt) !== Number(checkout.expected_amount)) return text('0|FAIL', { status: 400 });
  // A simulated callback and an authenticated payment failure are received safely,
  // but neither represents a fulfillment event.
  if (String(fields.SimulatePaid || '0') === '1') return text('1|OK');
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
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
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
  return `PL${Math.floor(now).toString(36).toUpperCase()}${Math.floor(random() * 0xFFFFFF).toString(36).toUpperCase().padStart(5, '0')}`.slice(0, 20);
}

// Workers use UTC; explicitly shift before using UTC getters instead of relying
// on whatever local timezone the runtime happens to have.
export function ecpayTradeDate(date) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${taipei.getUTCFullYear()}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
}

function ecpayUrlEncode(value) { return encodeURIComponent(value).replace(/%20/g, '+').replace(/%21/g, '!').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2A/g, '*').replace(/%2D/g, '-').replace(/%2E/g, '.').replace(/%5F/g, '_'); }
function ecpayEndpoint(env) { return String(env.ECPAY_ENVIRONMENT) === 'production' ? PRODUCTION_ENDPOINT : STAGE_ENDPOINT; }
function publicOrigin(requestUrl, env) { return String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, ''); }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
function constantTimeEqual(left, right) { if (left.length !== right.length) return false; let result = 0; for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i); return result === 0; }
