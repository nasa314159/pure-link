import { describe, expect, it } from 'vitest';
import { AI_CREDIT_PACKS } from '../src/credit-products.js';
import { createCheckMacValue, createEcpayCheckout, createMerchantTradeNo, ecpayTradeDate, handleEcpayCallback, isEcpayCheckoutConfigured, verifyCheckMacValue } from '../src/ecpay.js';

const env = {
  ECPAY_CHECKOUT_ENABLED: 'true', ECPAY_MERCHANT_ID: '2000132', ECPAY_HASH_KEY: '5294y06JbISpM5x9', ECPAY_HASH_IV: 'v77hoKGq4kWxNNIS', ECPAY_ENVIRONMENT: 'stage', PUBLIC_ORIGIN: 'https://no-no.uk',
};

describe('ECPay credit checkout', () => {
  it('is disabled by default and fails closed with incomplete configuration', () => {
    expect(isEcpayCheckoutConfigured({})).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_HASH_IV: '' })).toBe(false);
  });

  it('creates and verifies the official SHA-256 CheckMacValue', async () => {
    const fields = { MerchantID: '2000132', MerchantTradeNo: 'Test123456789', MerchantTradeDate: '2017/02/13 15:45:30', PaymentType: 'aio', TotalAmount: '100', TradeDesc: 'test', ItemName: 'test', ReturnURL: 'https://example.com/return', ChoosePayment: 'ALL', EncryptType: '1' };
    await expect(createCheckMacValue(fields, env)).resolves.toBe('18334F73281B77D81FC54781E46D88394DE95CCF7379215E3F508A4D852BA56C');
    const signed = { ...fields, CheckMacValue: await createCheckMacValue(fields, env) };
    await expect(verifyCheckMacValue(signed, env)).resolves.toBe(true);
    await expect(verifyCheckMacValue({ ...signed, TotalAmount: '101' }, env)).resolves.toBe(false);
  });

  it('maps only canonical pack IDs to server-controlled amounts and credits', async () => {
    for (const pack of Object.values(AI_CREDIT_PACKS)) {
      const db = new EcpayDb();
      const checkout = await createEcpayCheckout({ requestUrl: new URL('https://no-no.uk/zh-Hant/account'), user: { id: 'user-1' }, packId: pack.id, locale: 'zh-Hant', env: { ...env, pure_link_db: db } });
      expect(db.checkout).toMatchObject({ pack_id: pack.id, expected_amount: pack.priceTwd, expected_credits: pack.credits, user_id: 'user-1' });
      expect(checkout.fields.TotalAmount).toBe(String(pack.priceTwd));
      expect(checkout.fields.OrderResultURL).toBe('https://no-no.uk/zh-Hant/account?purchase=pending');
      await expect(verifyCheckMacValue(checkout.fields, env)).resolves.toBe(true);
    }
  });

  it('rejects invalid canonical pack IDs without writing a checkout', async () => {
    await expect(createEcpayCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, packId: '150', locale: 'en', env: { ...env, pure_link_db: new EcpayDb() } })).rejects.toMatchObject({ code: 'billingPackInvalid' });
  });

  it('uses a deterministic Asia/Taipei MerchantTradeDate and short ASCII trade numbers', () => {
    expect(ecpayTradeDate(new Date('2026-01-01T18:30:45.000Z'))).toBe('2026/01/02 02:30:45');
    expect(createMerchantTradeNo(1723622400000, () => 0.1234)).toMatch(/^[A-Za-z0-9]{1,20}$/);
  });

  it('fulfills a valid callback once and acknowledges its exact duplicate', async () => {
    const { db, fields } = await pendingCallback('small');
    const configured = { ...env, pure_link_db: db };
    expect(await (await handleEcpayCallback(callbackRequest(fields), configured)).text()).toBe('1|OK');
    expect(db.balance).toBe(150);
    expect(await (await handleEcpayCallback(callbackRequest(fields), configured)).text()).toBe('1|OK');
    expect(db.balance).toBe(150);
    expect(db.orders).toHaveLength(1);
  });

  it.each([
    ['invalid CheckMacValue', async (fields) => ({ ...fields, CheckMacValue: '0'.repeat(64) })],
    ['wrong merchant', async (fields) => sign({ ...fields, MerchantID: '9999999' })],
    ['wrong amount', async (fields) => sign({ ...fields, TradeAmt: '999' })],
    ['unknown checkout', async (fields) => sign({ ...fields, MerchantTradeNo: 'PLUNKNOWN123' })],
  ])('never fulfills a callback with %s', async (_label, mutate) => {
    const { db, fields } = await pendingCallback('standard');
    const response = await handleEcpayCallback(callbackRequest(await mutate(fields)), { ...env, pure_link_db: db });
    expect(response.status).toBe(400);
    expect(db.balance).toBe(0);
  });

  it('acknowledges an authenticated payment failure but does not fulfill it', async () => {
    const { db, fields } = await pendingCallback('standard');
    const failed = await sign({ ...fields, RtnCode: '10200095', RtnMsg: 'Payment failed' });
    expect(await (await handleEcpayCallback(callbackRequest(failed), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.balance).toBe(0);
    expect(db.checkout.status).toBe('failed');
  });

  it('never fulfills a simulated callback or conflicting duplicate', async () => {
    const { db, fields } = await pendingCallback('large');
    const configured = { ...env, pure_link_db: db };
    expect(await (await handleEcpayCallback(callbackRequest(await sign({ ...fields, SimulatePaid: '1' })), configured)).text()).toBe('1|OK');
    expect(db.balance).toBe(0);
    await handleEcpayCallback(callbackRequest(fields), configured);
    const conflicting = await sign({ ...fields, TradeNo: 'OTHERTRADE' });
    expect((await handleEcpayCallback(callbackRequest(conflicting), configured)).status).toBe(400);
    expect(db.balance).toBe(1000);
  });
});

async function pendingCallback(packId) {
  const db = new EcpayDb();
  const checkout = await createEcpayCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, packId, locale: 'en', env: { ...env, pure_link_db: db } });
  const fields = await sign({ MerchantID: env.ECPAY_MERCHANT_ID, MerchantTradeNo: checkout.fields.MerchantTradeNo, TradeNo: `TN${packId}123`, RtnCode: '1', RtnMsg: 'Succeeded', TradeAmt: checkout.fields.TotalAmount, SimulatePaid: '0' });
  return { db, fields };
}
async function sign(fields) { return { ...fields, CheckMacValue: await createCheckMacValue(fields, env) }; }
function callbackRequest(fields) { return new Request('https://no-no.uk/api/webhooks/ecpay', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }); }

class EcpayDb {
  constructor() { this.checkout = null; this.orders = []; this.balance = 0; }
  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim(); const db = this;
    return { bind(...values) { return {
      async first() {
        if (normalized.startsWith('SELECT id, user_id, pack_id')) return db.checkout?.merchant_trade_no === values[0] ? db.checkout : null;
        if (normalized.startsWith('SELECT trade_no FROM ecpay_orders')) return db.orders.find((order) => order.checkout_request_id === values[0]) || null;
        return null;
      },
      async run() {
        if (normalized.startsWith('INSERT INTO ecpay_checkout_requests')) { db.checkout = { id: values[0], merchant_trade_no: values[1], user_id: values[2], pack_id: values[3], expected_amount: values[4], expected_credits: values[5], status: 'pending' }; return changed(1); }
        if (normalized.startsWith('INSERT OR IGNORE INTO ecpay_orders')) { if (db.orders.some((order) => order.merchant_trade_no === values[0] || order.trade_no === values[1] || order.checkout_request_id === values[2])) return changed(0); db.orders.push({ merchant_trade_no: values[0], trade_no: values[1], checkout_request_id: values[2] }); db.balance += values[6]; return changed(1); }
        if (normalized.startsWith('UPDATE ecpay_checkout_requests')) { db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed'; return changed(1); }
        return changed(0);
      },
    }; } };
  }
}
function changed(count) { return { success: true, meta: { changes: count } }; }
