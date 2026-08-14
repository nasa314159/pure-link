import { describe, expect, it } from 'vitest';
import {
  ECPAY_TIERS,
  createCheckMacValue,
  createEcpayCheckout,
  createMerchantTradeNo,
  ecpayTradeDate,
  handleEcpayCallback,
  verifyCheckMacValue,
} from '../src/ecpay.js';

const env = {
  ECPAY_CHECKOUT_ENABLED: 'true',
  ECPAY_MERCHANT_ID: '2000132',
  ECPAY_HASH_KEY: '5294y06JbISpM5x9',
  ECPAY_HASH_IV: 'v77hoKGq4kWxNNIS',
  ECPAY_ENVIRONMENT: 'stage',
  PUBLIC_ORIGIN: 'https://no-no.uk',
};

describe('ECPay billing', () => {
  it('creates the official SHA-256 CheckMacValue from a deterministic fixture', async () => {
    const fields = signingFields();
    await expect(createCheckMacValue(fields, env)).resolves.toBe('18334F73281B77D81FC54781E46D88394DE95CCF7379215E3F508A4D852BA56C');
    const signed = { ...fields, CheckMacValue: await createCheckMacValue(fields, env) };
    await expect(verifyCheckMacValue(signed, env)).resolves.toBe(true);
    await expect(verifyCheckMacValue({ ...signed, TotalAmount: '101' }, env)).resolves.toBe(false);

    const callback = { ...callbackSigningFields(), CheckMacValue: 'F39068C4CB28FA323DDE1F89E8FDD36C98131D7C1EA26DB6F02BDE9339CBB2A4' };
    await expect(verifyCheckMacValue(callback, env)).resolves.toBe(true);
  });

  it('maps only trusted fixed Taiwan-dollar tiers and emits a valid ECPay form', async () => {
    for (const [tier, product] of Object.entries(ECPAY_TIERS)) {
      const db = new EcpayDb();
      const checkout = await createEcpayCheckout({
        requestUrl: new URL('https://no-no.uk/zh-Hant/account'),
        user: { id: 'user-1' },
        tier,
        // Amounts and credits supplied by a browser are intentionally not inputs to this API.
        amount: 1,
        credits: 999999,
        resultPath: '/zh-Hant/account?purchase=pending',
        env: { ...env, pure_link_db: db },
      });
      expect(db.checkout).toMatchObject({ tier, expected_amount: product.amount, expected_credits: product.credits, user_id: 'user-1' });
      expect(checkout.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
      expect(checkout.fields).toMatchObject({
        MerchantID: env.ECPAY_MERCHANT_ID,
        PaymentType: 'aio',
        TotalAmount: String(product.amount),
        ChoosePayment: 'ALL',
        EncryptType: '1',
        ReturnURL: 'https://no-no.uk/api/webhooks/ecpay',
        OrderResultURL: 'https://no-no.uk/zh-Hant/account?purchase=pending',
      });
      expect(checkout.fields.MerchantTradeNo).toMatch(/^[A-Za-z0-9]{1,20}$/);
      expect(await verifyCheckMacValue(checkout.fields, env)).toBe(true);
    }
  });

  it('generates short ASCII-alphanumeric MerchantTradeNo values', () => {
    const merchantTradeNo = createMerchantTradeNo(1723622400000, () => 0.1234);
    expect(merchantTradeNo).toMatch(/^[A-Za-z0-9]{1,20}$/);
    expect(merchantTradeNo.length).toBeLessThanOrEqual(20);
  });

  it('formats MerchantTradeDate in Asia/Taipei without using the runtime timezone', () => {
    expect(ecpayTradeDate(new Date('2026-01-01T18:30:45.000Z'))).toBe('2026/01/02 02:30:45');
  });

  it('fulfills a valid callback once and accepts its duplicate safely', async () => {
    const { db, fields } = await pendingCallback('150');
    const configured = { ...env, pure_link_db: db };
    const first = await handleEcpayCallback(callbackRequest(fields), configured);
    expect(first.status).toBe(200);
    await expect(first.text()).resolves.toBe('1|OK');
    expect(db.balance).toBe(150);
    expect(db.checkout.status).toBe('completed');

    const duplicate = await handleEcpayCallback(callbackRequest(fields), configured);
    expect(duplicate.status).toBe(200);
    await expect(duplicate.text()).resolves.toBe('1|OK');
    expect(db.balance).toBe(150);
    expect(db.orders).toHaveLength(1);
  });

  it.each([
    ['invalid CheckMacValue', (fields) => ({ ...fields, CheckMacValue: '0'.repeat(64) })],
    ['wrong merchant', (fields) => ({ ...fields, MerchantID: '9999999' })],
    ['wrong amount', (fields) => ({ ...fields, TradeAmt: '999' })],
  ])('does not fulfill a callback with %s', async (_label, mutate) => {
    const { db, fields } = await pendingCallback('300');
    const changed = mutate(fields);
    if (_label !== 'invalid CheckMacValue') changed.CheckMacValue = await createCheckMacValue(changed, env);
    const response = await handleEcpayCallback(callbackRequest(changed), { ...env, pure_link_db: db });
    expect(response.status).toBe(400);
    expect(db.balance).toBe(0);
    expect(db.orders).toHaveLength(0);
  });

  it('acknowledges an authenticated non-success payment without granting credits', async () => {
    const { db, fields } = await pendingCallback('300');
    const failed = { ...fields, RtnCode: '10200095', RtnMsg: 'Payment failed' };
    failed.CheckMacValue = await createCheckMacValue(failed, env);
    const response = await handleEcpayCallback(callbackRequest(failed), { ...env, pure_link_db: db });
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('1|OK');
    expect(db.balance).toBe(0);
    expect(db.orders).toHaveLength(0);
    expect(db.checkout.status).toBe('failed');
  });

  it('acknowledges but never fulfills SimulatePaid callbacks', async () => {
    const { db, fields } = await pendingCallback('600');
    const simulated = { ...fields, SimulatePaid: '1' };
    simulated.CheckMacValue = await createCheckMacValue(simulated, env);
    const response = await handleEcpayCallback(callbackRequest(simulated), { ...env, pure_link_db: db });
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('1|OK');
    expect(db.balance).toBe(0);
    expect(db.checkout.status).toBe('pending');
  });
});

async function pendingCallback(tier) {
  const db = new EcpayDb();
  const checkout = await createEcpayCheckout({
    requestUrl: new URL('https://no-no.uk/en/account'), user: { id: 'user-1' }, tier, env: { ...env, pure_link_db: db },
  });
  const fields = {
    MerchantID: env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: checkout.fields.MerchantTradeNo,
    TradeNo: `TN${tier}ABC123`,
    RtnCode: '1',
    RtnMsg: 'Succeeded',
    TradeAmt: checkout.fields.TotalAmount,
    SimulatePaid: '0',
  };
  fields.CheckMacValue = await createCheckMacValue(fields, env);
  return { db, fields };
}

function callbackRequest(fields) {
  return new Request('https://no-no.uk/api/webhooks/ecpay', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields),
  });
}

function signingFields() {
  return {
    MerchantID: '2000132', MerchantTradeNo: 'Test123456789', MerchantTradeDate: '2017/02/13 15:45:30',
    PaymentType: 'aio', TotalAmount: '100', TradeDesc: 'test', ItemName: 'test',
    ReturnURL: 'https://example.com/return', ChoosePayment: 'ALL', EncryptType: '1',
  };
}

function callbackSigningFields() {
  return {
    MerchantID: '2000132', MerchantTradeNo: 'PLTEST123456789', TradeNo: 'TNTEST123456789',
    RtnCode: '1', RtnMsg: 'Succeeded', TradeAmt: '150', SimulatePaid: '0',
  };
}

class EcpayDb {
  constructor() { this.checkout = null; this.orders = []; this.balance = 0; }

  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    return {
      bind(...values) {
        return {
          async first() {
            if (normalized.startsWith('SELECT id, user_id, expected_amount')) return db.checkout?.merchant_trade_no === values[0] ? db.checkout : null;
            if (normalized.startsWith('SELECT trade_no FROM ecpay_orders')) return db.orders.find((order) => order.checkout_request_id === values[0]) || null;
            return null;
          },
          async run() {
            if (normalized.startsWith('INSERT INTO ecpay_checkout_requests')) {
              db.checkout = {
                id: values[0], merchant_trade_no: values[1], user_id: values[2], tier: values[3], expected_amount: values[4], expected_credits: values[5], status: 'pending',
              };
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO ecpay_orders')) {
              if (db.orders.some((order) => order.merchant_trade_no === values[0] || order.trade_no === values[1] || order.checkout_request_id === values[2])) return changed(0);
              db.orders.push({ merchant_trade_no: values[0], trade_no: values[1], checkout_request_id: values[2], user_id: values[3], amount: values[4], credits_total: values[5] });
              db.balance += values[5];
              return changed(1);
            }
            if (normalized.startsWith('UPDATE ecpay_checkout_requests')) {
              db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed';
              return changed(1);
            }
            return changed(0);
          },
        };
      },
    };
  }
}

function changed(count) { return { success: true, meta: { changes: count } }; }
