import { text } from './http.js';

const STAGE_ENDPOINT = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
const PRODUCTION_ENDPOINT = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

export const ECPAY_TIERS = Object.freeze({
  150: { amount: 150, credits: 150 },
  300: { amount: 300, credits: 400 },
  600: { amount: 600, credits: 1000 },
});

export class EcpayError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'EcpayError'; this.status = status; }
}

export function isEcpayConfigured(env) {
  return env.ECPAY_CHECKOUT_ENABLED === 'true'
    && /^[0-9A-Za-z]{1,10}$/.test(String(env.ECPAY_MERCHANT_ID || ''))
    && Boolean(env.ECPAY_HASH_KEY && env.ECPAY_HASH_IV)
    && ['stage', 'production'].includes(String(env.ECPAY_ENVIRONMENT || 'stage'));
}

export async function createEcpayCheckout({ requestUrl, user, tier, env, resultPath = '/account?purchase=pending' }) {
  const product = ECPAY_TIERS[String(tier)];
  if (!isEcpayConfigured(env)) throw new EcpayError('ECPay checkout is not available.', 503);
  if (!product) throw new EcpayError('The selected ECPay credit pack is not available.');
  const id = crypto.randomUUID();
  const merchantTradeNo = createMerchantTradeNo();
  await env.pure_link_db.prepare(`
    INSERT INTO ecpay_checkout_requests (id, merchant_trade_no, user_id, tier, expected_amount, expected_credits)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, merchantTradeNo, user.id, String(tier), product.amount, product.credits).run();

  const fields = {
    MerchantID: String(env.ECPAY_MERCHANT_ID),
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: ecpayTradeDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: String(product.amount),
    TradeDesc: 'PureLink AI formula credits',
    ItemName: `PureLink AI formula drafts x ${product.credits}`,
    ReturnURL: `${publicOrigin(requestUrl, env)}/api/webhooks/ecpay`,
    OrderResultURL: `${publicOrigin(requestUrl, env)}${safeResultPath(resultPath)}`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };
  return { action: ecpayEndpoint(env), fields: { ...fields, CheckMacValue: await createCheckMacValue(fields, env) } };
}

export async function handleEcpayCallback(request, env) {
  if (!isEcpayConfigured(env)) return text('0|FAIL', { status: 503 });
  const fields = Object.fromEntries(await request.formData());
  if (!await verifyCheckMacValue(fields, env)) return text('0|FAIL', { status: 400 });
  if (String(fields.MerchantID) !== String(env.ECPAY_MERCHANT_ID)) return text('0|FAIL', { status: 400 });
  if (String(fields.SimulatePaid || '0') === '1') return text('1|OK');
  if (String(fields.RtnCode) !== '1') return text('0|FAIL', { status: 400 });
  const merchantTradeNo = String(fields.MerchantTradeNo || '');
  const tradeNo = String(fields.TradeNo || '');
  if (!/^[A-Za-z0-9]{1,20}$/.test(merchantTradeNo) || !/^[A-Za-z0-9]{1,64}$/.test(tradeNo)) return text('0|FAIL', { status: 400 });
  if (!/^\d+$/.test(String(fields.TradeAmt || ''))) return text('0|FAIL', { status: 400 });
  const checkout = await env.pure_link_db.prepare(`
    SELECT id, user_id, expected_amount, expected_credits, status
    FROM ecpay_checkout_requests WHERE merchant_trade_no = ?
  `).bind(merchantTradeNo).first();
  if (!checkout || !['pending', 'completed'].includes(checkout.status) || Number(fields.TradeAmt) !== Number(checkout.expected_amount)) return text('0|FAIL', { status: 400 });
  if (checkout.status === 'completed') {
    const order = await env.pure_link_db.prepare('SELECT trade_no FROM ecpay_orders WHERE checkout_request_id = ?').bind(checkout.id).first();
    return order?.trade_no === tradeNo ? text('1|OK') : text('0|FAIL', { status: 400 });
  }
  const result = await env.pure_link_db.prepare(`
    INSERT OR IGNORE INTO ecpay_orders (merchant_trade_no, trade_no, checkout_request_id, user_id, amount, credits_total, status)
    VALUES (?, ?, ?, ?, ?, ?, 'paid')
  `).bind(merchantTradeNo, tradeNo, checkout.id, checkout.user_id, checkout.expected_amount, checkout.expected_credits).run();
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
  if (!/^[A-F0-9]{64}$/.test(provided)) return false;
  return constantTimeEqual(await createCheckMacValue(fields, env), provided);
}

export function createMerchantTradeNo(now = Date.now(), random = Math.random) {
  return `PL${Math.floor(now).toString(36).toUpperCase()}${Math.floor(random() * 0xFFFFFF).toString(36).toUpperCase().padStart(5, '0')}`.slice(0, 20);
}

export function ecpayTradeDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function ecpayUrlEncode(value) {
  return encodeURIComponent(value).replace(/%20/g, '+').replace(/%21/g, '!').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2A/g, '*').replace(/%2D/g, '-').replace(/%2E/g, '.').replace(/%5F/g, '_');
}

function ecpayEndpoint(env) { return String(env.ECPAY_ENVIRONMENT) === 'production' ? PRODUCTION_ENDPOINT : STAGE_ENDPOINT; }
function publicOrigin(requestUrl, env) { return String(env.PUBLIC_ORIGIN || requestUrl.origin).replace(/\/$/, ''); }
function safeResultPath(value) { const path = String(value || ''); return path.startsWith('/') && !path.startsWith('//') ? path : '/account?purchase=pending'; }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
function constantTimeEqual(left, right) { if (left.length !== right.length) return false; let result = 0; for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i); return result === 0; }
