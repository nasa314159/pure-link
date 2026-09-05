import {
  createCheckMacValue,
  createMerchantTradeNo,
  ecpayEndpoint,
  ecpayPublicOrigin,
  ecpayTradeDate,
  isEcpayConfigured,
  verifyCheckMacValue,
} from './ecpay.js';
import { redirect, text } from './http.js';
import { PaymentError } from './payment-error.js';

export const SUPPORT_PRESET_AMOUNTS = Object.freeze([100, 300, 500, 1000]);
export const SUPPORT_MIN_AMOUNT = 50;
export const SUPPORT_MAX_AMOUNT = 10000;

export function isEcpaySupportCheckoutConfigured(env) {
  return isEcpayConfigured(env) && env?.ECPAY_SUPPORT_CHECKOUT_ENABLED === 'true';
}

// Support has its own tables and callback. It never receives a user ID, pack ID,
// or credit count, so it cannot reach the AI-credit fulfillment path.
export async function createEcpaySupportCheckout({ requestUrl, locale, input, env }) {
  if (!isEcpaySupportCheckoutConfigured(env)) throw new PaymentError('supportUnavailable');
  const amount = parseSupportAmount(input?.amount);
  if (amount == null) throw new PaymentError('supportAmountInvalid', 400);
  const attribution = normalizePublicAttribution(input);
  const id = crypto.randomUUID();
  let merchantTradeNo = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    merchantTradeNo = createMerchantTradeNo();
    try {
      await env.pure_link_db.prepare(`
        INSERT INTO ecpay_support_checkout_requests (
          id, merchant_trade_no, expected_amount, public_name, public_message,
          public_amount, public_display_name, public_message_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, merchantTradeNo, amount, attribution.publicName, attribution.publicMessage,
        attribution.publicAmount, attribution.displayName, attribution.message,
      ).run();
      break;
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 2) throw error;
    }
  }

  const origin = ecpayPublicOrigin(requestUrl, env);
  const resultLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
  const fields = {
    MerchantID: String(env.ECPAY_MERCHANT_ID),
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: ecpayTradeDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: String(amount),
    TradeDesc: 'PureLink voluntary support',
    ItemName: 'PureLink voluntary support',
    ReturnURL: `${origin}/api/webhooks/ecpay-support`,
    // This browser POST is informational only. It does not inspect payment data.
    OrderResultURL: `${origin}/api/payment-return/ecpay-support?locale=${resultLocale}`,
    ClientBackURL: `${origin}/${resultLocale}/support?support=pending`,
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };
  return { provider: 'ecpay', action: ecpayEndpoint(env), fields: { ...fields, CheckMacValue: await createCheckMacValue(fields, env) } };
}

export function handleEcpaySupportBrowserReturn(requestUrl) {
  const locale = requestUrl.searchParams.get('locale') === 'zh-Hant' ? 'zh-Hant' : 'en';
  return redirect(`/${locale}/support?support=pending`, 303);
}

export async function handleEcpaySupportCallback(request, env) {
  if (!isEcpaySupportCheckoutConfigured(env)) return text('0|FAIL', { status: 503 });
  const fields = Object.fromEntries(await request.formData());
  if (!await verifyCheckMacValue(fields, env)) return text('0|FAIL', { status: 400 });
  if (String(fields.MerchantID) !== String(env.ECPAY_MERCHANT_ID)) return text('0|FAIL', { status: 400 });
  const merchantTradeNo = String(fields.MerchantTradeNo || '');
  const tradeAmount = parseSupportAmount(fields.TradeAmt);
  if (!validTradeNo(merchantTradeNo) || tradeAmount == null) return text('0|FAIL', { status: 400 });
  const checkout = await env.pure_link_db.prepare(`
    SELECT id, expected_amount, public_name, public_message, public_amount,
      public_display_name, public_message_text, status
    FROM ecpay_support_checkout_requests WHERE merchant_trade_no = ?
  `).bind(merchantTradeNo).first();
  if (!checkout || !['pending', 'completed', 'failed'].includes(checkout.status) || tradeAmount !== Number(checkout.expected_amount)) return text('0|FAIL', { status: 400 });
  // Merchant-console simulations are signed but are not money received.
  if (String(fields.SimulatePaid || '') !== '0') return text('1|OK');
  if (String(fields.RtnCode) !== '1') {
    if (checkout.status === 'pending') await markCheckout(env.pure_link_db, checkout.id, 'failed');
    return text('1|OK');
  }
  const tradeNo = String(fields.TradeNo || '');
  if (!validTradeNo(tradeNo, 64) || checkout.status === 'failed') return text('0|FAIL', { status: 400 });
  if (checkout.status === 'completed') {
    const contribution = await env.pure_link_db.prepare('SELECT trade_no FROM ecpay_support_contributions WHERE checkout_request_id = ?').bind(checkout.id).first();
    return contribution?.trade_no === tradeNo ? text('1|OK') : text('0|FAIL', { status: 400 });
  }
  const result = await env.pure_link_db.prepare(`
    INSERT OR IGNORE INTO ecpay_support_contributions (
      merchant_trade_no, trade_no, checkout_request_id, amount, public_name,
      public_message, public_amount, public_display_name, public_message_text, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
  `).bind(
    merchantTradeNo, tradeNo, checkout.id, tradeAmount, Number(checkout.public_name),
    Number(checkout.public_message), Number(checkout.public_amount),
    checkout.public_display_name || null, checkout.public_message_text || null,
  ).run();
  if (changes(result) === 0) {
    const contribution = await env.pure_link_db.prepare('SELECT trade_no FROM ecpay_support_contributions WHERE checkout_request_id = ?').bind(checkout.id).first();
    if (contribution?.trade_no !== tradeNo) return text('0|FAIL', { status: 400 });
  }
  await markCheckout(env.pure_link_db, checkout.id, 'completed');
  return text('1|OK');
}

export async function getEcpaySupportTotals(db) {
  if (!db) return emptyTotals();
  const totals = await db.prepare(`
    SELECT COALESCE(SUM(MAX(0, contribution.amount - COALESCE(refund.refunded_amount, 0))), 0) AS net_twd,
      COALESCE(SUM(CASE WHEN contribution.amount > COALESCE(refund.refunded_amount, 0) THEN 1 ELSE 0 END), 0) AS contribution_count
    FROM ecpay_support_contributions contribution
    LEFT JOIN (
      SELECT merchant_trade_no, SUM(amount) AS refunded_amount
      FROM ecpay_support_reconciliations WHERE kind = 'refund' GROUP BY merchant_trade_no
    ) refund ON refund.merchant_trade_no = contribution.merchant_trade_no
  `).bind().first();
  const supporters = await db.prepare(`
    SELECT contribution.public_name, contribution.public_message, contribution.public_amount,
      contribution.public_display_name, contribution.public_message_text,
      MAX(0, contribution.amount - COALESCE(refund.refunded_amount, 0)) AS net_amount
    FROM ecpay_support_contributions contribution
    LEFT JOIN (
      SELECT merchant_trade_no, SUM(amount) AS refunded_amount
      FROM ecpay_support_reconciliations WHERE kind = 'refund' GROUP BY merchant_trade_no
    ) refund ON refund.merchant_trade_no = contribution.merchant_trade_no
    WHERE contribution.amount > COALESCE(refund.refunded_amount, 0)
      AND (contribution.public_name = 1 OR contribution.public_message = 1 OR contribution.public_amount = 1)
    ORDER BY contribution.created_at DESC LIMIT 24
  `).bind().all();
  const history = await db.prepare(`
    SELECT day, SUM(amount) AS amount FROM (
      SELECT date(created_at) AS day, amount FROM ecpay_support_contributions
      UNION ALL
      SELECT date(created_at) AS day, -amount AS amount FROM ecpay_support_reconciliations WHERE kind = 'refund'
    ) GROUP BY day ORDER BY day ASC
  `).bind().all();
  return {
    netTwd: Math.max(0, Number(totals?.net_twd || 0)),
    contributionCount: Math.max(0, Number(totals?.contribution_count || 0)),
    publicSupporters: (supporters?.results || []).map((row) => ({
      name: Number(row.public_name) === 1 ? String(row.public_display_name || '') : '',
      message: Number(row.public_message) === 1 ? neutralizeMentions(String(row.public_message_text || '')) : '',
      amount: Number(row.public_amount) === 1 && Number(row.net_amount) > 0 ? Number(row.net_amount) : null,
    })),
    history: cumulativeHistory(history?.results || []),
  };
}

export function parseSupportAmount(value) {
  const source = String(value ?? '');
  if (!/^[0-9]+$/.test(source)) return null;
  const amount = Number(source);
  return Number.isSafeInteger(amount) && amount >= SUPPORT_MIN_AMOUNT && amount <= SUPPORT_MAX_AMOUNT ? amount : null;
}

export function normalizePublicAttribution(input = {}) {
  const wantsName = checked(input.publicName);
  const wantsMessage = checked(input.publicMessage);
  // Do not retain, validate, or expose text unless its independent public
  // consent control is checked.
  const displayName = wantsName ? normalizeText(input.displayName, 60, false) : null;
  const message = wantsMessage ? normalizeText(input.message, 200, true) : null;
  return {
    publicName: wantsName && displayName ? 1 : 0,
    publicMessage: wantsMessage && message ? 1 : 0,
    publicAmount: checked(input.publicAmount) ? 1 : 0,
    displayName: wantsName && displayName ? displayName : null,
    message: wantsMessage && message ? message : null,
  };
}

function emptyTotals() { return { netTwd: 0, contributionCount: 0, publicSupporters: [], history: [] }; }
function checked(value) { return value === true || String(value) === 'true' || String(value) === 'on'; }
function normalizeText(value, maximum, multiline) {
  const source = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (source.length > maximum) throw new PaymentError('supportAttributionInvalid', 400);
  const normalized = source.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return multiline ? normalized : normalized.replace(/\s+/g, ' ');
}
function neutralizeMentions(value) { return value.replaceAll('@', '@\u200B'); }
function validTradeNo(value, maximum = 20) { return new RegExp(`^[A-Za-z0-9]{1,${maximum}}$`).test(value); }
function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
function isUniqueConstraintError(error) { return /unique|constraint/i.test(String(error?.message || error)); }
async function markCheckout(db, id, status) { await db.prepare(`UPDATE ecpay_support_checkout_requests SET status = '${status}', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run(); }
function cumulativeHistory(rows) {
  let total = 0;
  return rows.map((row) => {
    total = Math.max(0, total + Number(row.amount || 0));
    return { day: String(row.day || ''), total };
  }).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day));
}
