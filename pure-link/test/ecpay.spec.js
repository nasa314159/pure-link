import { describe, expect, it } from 'vitest';
import { AI_CREDIT_PACKS } from '../src/credit-products.js';
import { createCheckMacValue, createEcpayCheckout, createMerchantTradeNo, ecpayEndpoint, ecpayTradeDate, ECPAY_PRODUCTION_ENDPOINT, ECPAY_STAGE_ENDPOINT, handleEcpayBrowserReturn, handleEcpayCallback, isEcpayCheckoutConfigured, verifyCheckMacValue } from '../src/ecpay.js';

const env = {
  ECPAY_CHECKOUT_ENABLED: 'true', ECPAY_MERCHANT_ID: '2000132', ECPAY_HASH_KEY: 'test-hash-key-12', ECPAY_HASH_IV: 'test-hash-iv-123', ECPAY_ENVIRONMENT: 'stage', PUBLIC_ORIGIN: 'https://no-no.uk',
};

describe('ECPay credit checkout', () => {
  it('is disabled by default and fails closed with incomplete configuration', () => {
    expect(isEcpayCheckoutConfigured({})).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_HASH_IV: '' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_ENVIRONMENT: '' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, PUBLIC_ORIGIN: '' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_HASH_KEY: 'short' })).toBe(false);
    expect(isEcpayCheckoutConfigured({ ...env, ECPAY_ENVIRONMENT: 'production', PUBLIC_ORIGIN: 'https://example.com' })).toBe(false);
  });

  it('does not create or process checkouts while ECPay is disabled', async () => {
    const db = new EcpayDb();
    await expect(createEcpayCheckout({ requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, packId: 'small', locale: 'en', env: { ...env, ECPAY_CHECKOUT_ENABLED: 'false', pure_link_db: db } })).rejects.toMatchObject({ code: 'billingUnavailable' });
    expect(db.checkout).toBeNull();
    const response = await handleEcpayCallback(callbackRequest({}), { ...env, ECPAY_CHECKOUT_ENABLED: 'false', pure_link_db: db });
    expect(response.status).toBe(503);
  });

  it('creates and verifies the official SHA-256 CheckMacValue', async () => {
    const fields = { MerchantID: '2000132', MerchantTradeNo: 'Test123456789', MerchantTradeDate: '2017/02/13 15:45:30', PaymentType: 'aio', TotalAmount: '100', TradeDesc: 'test', ItemName: 'test', ReturnURL: 'https://example.com/return', ChoosePayment: 'ALL', EncryptType: '1' };
    await expect(createCheckMacValue(fields, env)).resolves.toBe('884DDB92974D284A2BEB4D1373C9B9B630AECAD25738CE7D485BAB601C5805C0');
    const signed = { ...fields, CheckMacValue: await createCheckMacValue(fields, env) };
    await expect(verifyCheckMacValue(signed, env)).resolves.toBe(true);
    await expect(verifyCheckMacValue({ ...signed, TotalAmount: '101' }, env)).resolves.toBe(false);
  });

  it('selects the stage and production AioCheckOut V5 endpoints explicitly', async () => {
    expect(ecpayEndpoint(env)).toBe(ECPAY_STAGE_ENDPOINT);
    expect(ecpayEndpoint({ ...env, ECPAY_ENVIRONMENT: 'production' })).toBe(ECPAY_PRODUCTION_ENDPOINT);
    const checkout = await createEcpayCheckout({ requestUrl: new URL('https://attacker.example/en/account'), user: { id: 'user-1' }, packId: 'small', locale: 'en', env: { ...env, ECPAY_ENVIRONMENT: 'production', pure_link_db: new EcpayDb() } });
    expect(checkout.action).toBe(ECPAY_PRODUCTION_ENDPOINT);
    expect(checkout.fields.ReturnURL).toBe('https://no-no.uk/api/webhooks/ecpay');
    expect(checkout.fields.OrderResultURL).toBe('https://no-no.uk/api/payment-return/ecpay?locale=en');
    expect(checkout.fields.ClientBackURL).toBe('https://no-no.uk/en/account?purchase=pending');
  });

  it('maps only canonical pack IDs to server-controlled amounts and credits', async () => {
    for (const pack of Object.values(AI_CREDIT_PACKS)) {
      const db = new EcpayDb();
      const checkout = await createEcpayCheckout({ requestUrl: new URL('https://no-no.uk/zh-Hant/account'), user: { id: 'user-1' }, packId: pack.id, locale: 'zh-Hant', env: { ...env, pure_link_db: db } });
      expect(db.checkout).toMatchObject({ pack_id: pack.id, expected_amount: pack.priceTwd, expected_credits: pack.credits, user_id: 'user-1' });
      expect(checkout.fields.TotalAmount).toBe(String(pack.priceTwd));
      expect(checkout.fields.ReturnURL).toBe('https://no-no.uk/api/webhooks/ecpay');
      expect(checkout.fields.OrderResultURL).toBe('https://no-no.uk/api/payment-return/ecpay?locale=zh-Hant');
      expect(checkout.fields.ClientBackURL).toBe('https://no-no.uk/zh-Hant/account?purchase=pending');
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

  it('redirects browser returns without trusting their payload or touching fulfillment', async () => {
    const { db, fields } = await pendingCallback('large');
    const forged = new URL('https://no-no.uk/api/payment-return/ecpay?locale=zh-Hant');
    forged.searchParams.set('RtnCode', '1');
    forged.searchParams.set('TradeAmt', '1');
    forged.searchParams.set('MerchantTradeNo', fields.MerchantTradeNo);
    forged.searchParams.set('CheckMacValue', fields.CheckMacValue);
    const response = handleEcpayBrowserReturn(forged);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/zh-Hant/account?purchase=pending');
    expect(db.balance).toBe(0);
    expect(db.orders).toHaveLength(0);
    expect(db.checkout.status).toBe('pending');
  });

  it('constrains browser return locales to the supported localized account pages', () => {
    expect(handleEcpayBrowserReturn(new URL('https://no-no.uk/api/payment-return/ecpay?locale=en')).headers.get('location')).toBe('/en/account?purchase=pending');
    expect(handleEcpayBrowserReturn(new URL('https://no-no.uk/api/payment-return/ecpay?locale=zh-Hant')).headers.get('location')).toBe('/zh-Hant/account?purchase=pending');
    expect(handleEcpayBrowserReturn(new URL('https://no-no.uk/api/payment-return/ecpay?locale=https://attacker.example')).headers.get('location')).toBe('/en/account?purchase=pending');
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

  it('does not treat a callback without an explicit real-payment marker as paid', async () => {
    const { db, fields } = await pendingCallback('small');
    const unsignedMarker = { ...fields };
    delete unsignedMarker.SimulatePaid;
    expect(await (await handleEcpayCallback(callbackRequest(await sign(unsignedMarker)), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.balance).toBe(0);
    expect(db.checkout.status).toBe('pending');
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
