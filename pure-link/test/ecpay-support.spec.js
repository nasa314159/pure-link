import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createCheckMacValue, verifyCheckMacValue } from '../src/ecpay.js';
import { SUPPORT_MAX_AMOUNT, SUPPORT_MIN_AMOUNT, SUPPORT_PRESET_AMOUNTS, createEcpaySupportCheckout, getEcpaySupportTotals, handleEcpaySupportBrowserReturn, handleEcpaySupportCallback, isEcpaySupportCheckoutConfigured, normalizePublicAttribution, parseSupportAmount } from '../src/ecpay-support.js';

const env = {
  ECPAY_SUPPORT_CHECKOUT_ENABLED: 'true', ECPAY_MERCHANT_ID: '2000132', ECPAY_HASH_KEY: 'test-hash-key-12', ECPAY_HASH_IV: 'test-hash-iv-123', ECPAY_ENVIRONMENT: 'stage', PUBLIC_ORIGIN: 'https://no-no.uk',
};

describe('ECPay voluntary support', () => {
  it('is independently fail-closed and validates only bounded integer NTD amounts', () => {
    expect(isEcpaySupportCheckoutConfigured({})).toBe(false);
    expect(isEcpaySupportCheckoutConfigured({ ...env, ECPAY_SUPPORT_CHECKOUT_ENABLED: 'false' })).toBe(false);
    expect(isEcpaySupportCheckoutConfigured({ ...env, ECPAY_HASH_IV: '' })).toBe(false);
    expect(SUPPORT_PRESET_AMOUNTS).toEqual([100, 300, 500, 1000]);
    expect(parseSupportAmount(String(SUPPORT_MIN_AMOUNT))).toBe(SUPPORT_MIN_AMOUNT);
    expect(parseSupportAmount(String(SUPPORT_MAX_AMOUNT))).toBe(SUPPORT_MAX_AMOUNT);
    for (const invalid of ['', '49', '10001', '100.5', '-100', ' 100', '1e2']) expect(parseSupportAmount(invalid)).toBeNull();
  });

  it('creates a separate, signed NTD checkout without any credit fields', async () => {
    const db = new SupportDb();
    const checkout = await createEcpaySupportCheckout({
      requestUrl: new URL('https://attacker.example/en/support'), locale: 'zh-Hant', input: { amount: '500', displayName: 'Private', message: 'Private too' }, env: { ...env, ECPAY_ENVIRONMENT: 'production', pure_link_db: db },
    });
    expect(checkout.fields.TotalAmount).toBe('500');
    expect(checkout.fields.ReturnURL).toBe('https://no-no.uk/api/webhooks/ecpay-support');
    expect(checkout.fields.OrderResultURL).toBe('https://no-no.uk/api/payment-return/ecpay-support?locale=zh-Hant');
    expect(checkout.fields.ClientBackURL).toBe('https://no-no.uk/zh-Hant/support?support=pending');
    expect(checkout.fields.ChoosePayment).toBe('ALL');
    expect(db.checkout).toMatchObject({ expected_amount: 500, public_name: 0, public_message: 0, public_amount: 0, public_display_name: null, public_message_text: null });
    expect(JSON.stringify(db.checkout)).not.toContain('credit');
    await expect(verifyCheckMacValue(checkout.fields, env)).resolves.toBe(true);
  });

  it('records opt-in name, message, and amount independently and neutralizes mentions when displaying', async () => {
    const attribution = normalizePublicAttribution({ displayName: ' nasa ', message: 'thank you @everyone', publicName: 'true', publicMessage: 'true', publicAmount: 'true' });
    expect(attribution).toEqual({ publicName: 1, publicMessage: 1, publicAmount: 1, displayName: 'nasa', message: 'thank you @everyone' });
    const db = new SupportDb();
    const checkout = await createEcpaySupportCheckout({ requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '100', displayName: 'nasa', message: 'thanks @everyone', publicName: true, publicMessage: true, publicAmount: true }, env: { ...env, pure_link_db: db } });
    await handleEcpaySupportCallback(callbackRequest(await paidFields(checkout)), { ...env, pure_link_db: db });
    const totals = await getEcpaySupportTotals(db);
    expect(totals.publicSupporters).toEqual([{ name: 'nasa', message: 'thanks @\u200Beveryone', amount: 100 }]);
  });

  it('accepts 2,000-character multiline public messages and preserves newlines', () => {
    const message = `\n${'a'.repeat(997)}\n${'b'.repeat(1000)}\n`;
    expect(message).toHaveLength(2000);
    expect(normalizePublicAttribution({ message, publicMessage: true })).toMatchObject({ publicMessage: 1, message });
    expect(normalizePublicAttribution({ message: 'line one\nline two', publicMessage: true })).toMatchObject({ message: 'line one\nline two' });
    expect(normalizePublicAttribution({ message: 'x'.repeat(200), publicMessage: true })).toMatchObject({ publicMessage: 1 });
    expect(() => normalizePublicAttribution({ message: 'x'.repeat(2001), publicMessage: true })).toThrow(/supportAttributionInvalid/);
  });

  it('uses Unicode code points for public-message and display-name limits', () => {
    const message = '😀'.repeat(2000);
    const name = '😀'.repeat(60);
    expect(message.length).toBe(4000);
    expect(Array.from(message)).toHaveLength(2000);
    expect(normalizePublicAttribution({ message, publicMessage: true })).toMatchObject({ publicMessage: 1, message });
    expect(() => normalizePublicAttribution({ message: `${message}😀`, publicMessage: true })).toThrow(/supportAttributionInvalid/);
    expect(normalizePublicAttribution({ displayName: name, publicName: true })).toMatchObject({ publicName: 1, displayName: name });
    expect(() => normalizePublicAttribution({ displayName: `${name}😀`, publicName: true })).toThrow(/supportAttributionInvalid/);
  });

  it('keeps private support text private without validating or storing it', () => {
    expect(normalizePublicAttribution({ displayName: 'private', message: 'x'.repeat(2001) })).toEqual({ publicName: 0, publicMessage: 0, publicAmount: 0, displayName: null, message: null });
  });

  it('uses a 303-only browser return that cannot record support or credits', async () => {
    const { db, checkout } = await pendingCheckout('300');
    const response = handleEcpaySupportBrowserReturn(new URL(`https://no-no.uk/api/payment-return/ecpay-support?locale=zh-Hant&RtnCode=1&MerchantTradeNo=${checkout.fields.MerchantTradeNo}`));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/zh-Hant/support?support=pending');
    expect(db.contributions).toHaveLength(0);
    expect(db.creditBalance).toBe(0);
    expect(db.checkout.status).toBe('pending');
  });

  it('records one verified real callback without changing AI credits and acknowledges its exact duplicate', async () => {
    const { db, checkout } = await pendingCheckout('100');
    const fields = await paidFields(checkout);
    expect(await (await handleEcpaySupportCallback(callbackRequest(fields), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.contributions).toHaveLength(1);
    expect(db.creditBalance).toBe(0);
    expect(await (await handleEcpaySupportCallback(callbackRequest(fields), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.contributions).toHaveLength(1);
  });

  it.each([
    ['invalid MAC', async (fields) => ({ ...fields, CheckMacValue: '0'.repeat(64) })],
    ['wrong merchant', async (fields) => sign({ ...fields, MerchantID: '9999999' })],
    ['wrong amount', async (fields) => sign({ ...fields, TradeAmt: '999' })],
  ])('does not record support for %s', async (_label, mutate) => {
    const { db, checkout } = await pendingCheckout('300');
    const response = await handleEcpaySupportCallback(callbackRequest(await mutate(await paidFields(checkout))), { ...env, pure_link_db: db });
    expect(response.status).toBe(400);
    expect(db.contributions).toHaveLength(0);
    expect(db.creditBalance).toBe(0);
  });

  it('acknowledges simulated and failed callbacks without recording a contribution', async () => {
    const { db, checkout } = await pendingCheckout('500');
    const simulated = await sign({ ...(await paidFields(checkout)), SimulatePaid: '1' });
    expect(await (await handleEcpaySupportCallback(callbackRequest(simulated), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.contributions).toHaveLength(0);
    const failed = await sign({ ...(await paidFields(checkout)), RtnCode: '10200095', RtnMsg: 'failed' });
    expect(await (await handleEcpaySupportCallback(callbackRequest(failed), { ...env, pure_link_db: db })).text()).toBe('1|OK');
    expect(db.checkout.status).toBe('failed');
  });

  it('shows the remaining public amount after a partial refund and removes a fully refunded supporter', async () => {
    const db = new SupportDb();
    db.contributions.push({ merchant_trade_no: 'PLSUPPORT', trade_no: 'TN1', checkout_request_id: 'checkout-1', amount: 500, public_name: 0, public_message: 0, public_amount: 1, created_at: '2026-09-01 10:00:00' });
    db.reconciliations.push({ merchant_trade_no: 'PLSUPPORT', kind: 'refund', amount: 200, created_at: '2026-09-02 10:00:00' });
    await expect(getEcpaySupportTotals(db)).resolves.toMatchObject({ netTwd: 300, contributionCount: 1, publicSupporters: [{ name: '', message: '', amount: 300 }], history: [{ day: '2026-09-01', total: 500 }, { day: '2026-09-02', total: 300 }] });
    db.reconciliations.push({ merchant_trade_no: 'PLSUPPORT', kind: 'refund', amount: 300, created_at: '2026-09-03 10:00:00' });
    await expect(getEcpaySupportTotals(db)).resolves.toMatchObject({ netTwd: 0, contributionCount: 0, publicSupporters: [], history: [{ day: '2026-09-01', total: 500 }, { day: '2026-09-02', total: 300 }, { day: '2026-09-03', total: 0 }] });
  });

  it('rejects unknown and cumulative over-refunds at the SQLite migration boundary', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(readFileSync(new URL('../migrations/0011_ecpay_support.sql', import.meta.url), 'utf8'));
      db.exec("INSERT INTO ecpay_support_checkout_requests (id, merchant_trade_no, expected_amount) VALUES ('checkout-1', 'PLSUPPORT', 500)");
      db.exec("INSERT INTO ecpay_support_contributions (merchant_trade_no, trade_no, checkout_request_id, amount) VALUES ('PLSUPPORT', 'TN1', 'checkout-1', 500)");
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-1', 'PLSUPPORT', 'refund', 200)")).not.toThrow();
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-2', 'PLSUPPORT', 'refund', 300)")).not.toThrow();
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-3', 'PLSUPPORT', 'refund', 1)")).toThrow(/exceeds contribution amount/);
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-unknown', 'PLUNKNOWN', 'refund', 1)")).toThrow(/Unknown ECPay support contribution/);
      expect(() => db.exec("UPDATE ecpay_support_reconciliations SET amount = 301 WHERE id = 'refund-2'")).toThrow(/exceeds contribution amount/);
      expect(() => db.exec("UPDATE ecpay_support_reconciliations SET merchant_trade_no = 'PLUNKNOWN' WHERE id = 'refund-1'")).toThrow(/Unknown ECPay support contribution/);
    } finally {
      db.close();
    }
  });

  it('preserves an existing support ledger while upgrading the message constraint', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys = ON');
      applyMigration(db, '0011_ecpay_support.sql');
      db.exec("INSERT INTO ecpay_support_checkout_requests (id, merchant_trade_no, expected_amount, public_message, public_message_text, created_at, updated_at) VALUES ('checkout-upgrade', 'PLUPGRADE', 500, 1, 'existing message', '2026-09-01 01:02:03', '2026-09-01 01:02:04')");
      db.exec("INSERT INTO ecpay_support_contributions (merchant_trade_no, trade_no, checkout_request_id, amount, public_message, public_message_text, created_at) VALUES ('PLUPGRADE', 'TNUPGRADE', 'checkout-upgrade', 500, 1, 'existing message', '2026-09-01 01:02:05')");
      db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount, created_at) VALUES ('refund-upgrade', 'PLUPGRADE', 'refund', 100, '2026-09-01 01:02:06')");
      applyMigration(db, '0012_support_public_message_limit.sql');
      expect(db.prepare("SELECT public_message_text, created_at FROM ecpay_support_contributions WHERE merchant_trade_no = 'PLUPGRADE'").get()).toEqual({ public_message_text: 'existing message', created_at: '2026-09-01 01:02:05' });
      expect(db.prepare("SELECT amount, created_at FROM ecpay_support_reconciliations WHERE id = 'refund-upgrade'").get()).toEqual({ amount: 100, created_at: '2026-09-01 01:02:06' });
      expect(() => db.exec(`INSERT INTO ecpay_support_checkout_requests (id, merchant_trade_no, expected_amount, public_message, public_message_text) VALUES ('checkout-long', 'PLLONG', 500, 1, '${'m'.repeat(2000)}')`)).not.toThrow();
      expect(() => db.exec(`INSERT INTO ecpay_support_checkout_requests (id, merchant_trade_no, expected_amount, public_message, public_message_text) VALUES ('checkout-too-long', 'PLTOOLONG', 500, 1, '${'m'.repeat(2001)}')`)).toThrow();
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-upgrade-rest', 'PLUPGRADE', 'refund', 400)")).not.toThrow();
      expect(() => db.exec("INSERT INTO ecpay_support_reconciliations (id, merchant_trade_no, kind, amount) VALUES ('refund-upgrade-excess', 'PLUPGRADE', 'refund', 1)")).toThrow(/exceeds contribution amount/);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('Support amount validation and checkout creation', () => {
  it.each([100, 300, 500, 1000])('accepts preset amount %i and creates checkout with correct TotalAmount', async (presetAmount) => {
    const db = new SupportDb();
    const checkout = await createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: String(presetAmount) }, env: { ...env, pure_link_db: db },
    });
    expect(checkout.fields.TotalAmount).toBe(String(presetAmount));
    expect(db.checkout.expected_amount).toBe(presetAmount);
  });

  it('accepts custom minimum amount 50', async () => {
    const db = new SupportDb();
    const checkout = await createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '50' }, env: { ...env, pure_link_db: db },
    });
    expect(checkout.fields.TotalAmount).toBe('50');
    expect(db.checkout.expected_amount).toBe(50);
  });

  it('accepts custom maximum amount 10000', async () => {
    const db = new SupportDb();
    const checkout = await createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '10000' }, env: { ...env, pure_link_db: db },
    });
    expect(checkout.fields.TotalAmount).toBe('10000');
    expect(db.checkout.expected_amount).toBe(10000);
  });

  it('rejects custom amount below minimum (49)', async () => {
    const db = new SupportDb();
    await expect(createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '49' }, env: { ...env, pure_link_db: db },
    })).rejects.toThrow();
  });

  it('rejects custom amount above maximum (10001)', async () => {
    const db = new SupportDb();
    await expect(createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '10001' }, env: { ...env, pure_link_db: db },
    })).rejects.toThrow();
  });

  it('rejects non-integer amount (100.5)', async () => {
    const db = new SupportDb();
    await expect(createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: '100.5' }, env: { ...env, pure_link_db: db },
    })).rejects.toThrow();
  });

  it('rejects non-numeric amount', async () => {
    const db = new SupportDb();
    await expect(createEcpaySupportCheckout({
      requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount: 'abc' }, env: { ...env, pure_link_db: db },
    })).rejects.toThrow();
  });
});

async function pendingCheckout(amount) {
  const db = new SupportDb();
  const checkout = await createEcpaySupportCheckout({ requestUrl: new URL('https://no-no.uk/en/support'), locale: 'en', input: { amount }, env: { ...env, pure_link_db: db } });
  return { db, checkout };
}
async function paidFields(checkout) { return sign({ MerchantID: env.ECPAY_MERCHANT_ID, MerchantTradeNo: checkout.fields.MerchantTradeNo, TradeNo: 'TNsupport123', RtnCode: '1', RtnMsg: 'Succeeded', TradeAmt: checkout.fields.TotalAmount, SimulatePaid: '0' }); }
async function sign(fields) { return { ...fields, CheckMacValue: await createCheckMacValue(fields, env) }; }
function callbackRequest(fields) { return new Request('https://no-no.uk/api/webhooks/ecpay-support', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }); }
function applyMigration(db, name) { db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')); }

class SupportDb {
  constructor() { this.checkout = null; this.contributions = []; this.reconciliations = []; this.creditBalance = 0; }
  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim(); const db = this;
    return { bind(...values) { return {
      async first() {
        if (normalized.startsWith('SELECT id, expected_amount')) return db.checkout?.merchant_trade_no === values[0] ? db.checkout : null;
        if (normalized.startsWith('SELECT trade_no FROM ecpay_support_contributions')) return db.contributions.find((item) => item.checkout_request_id === values[0]) || null;
        if (normalized.startsWith('SELECT COALESCE(SUM')) {
          const active = db.contributions.map((contribution) => ({ contribution, refunded: db.reconciliations.filter((refund) => refund.merchant_trade_no === contribution.merchant_trade_no).reduce((sum, refund) => sum + refund.amount, 0) }));
          return { net_twd: active.reduce((sum, item) => sum + Math.max(0, item.contribution.amount - item.refunded), 0), contribution_count: active.filter((item) => item.contribution.amount > item.refunded).length };
        }
        return null;
      },
      async all() {
        if (normalized.startsWith('SELECT contribution.public_name')) {
          return {
            results: db.contributions.map((item) => ({
              ...item,
              net_amount: Math.max(0, item.amount - db.reconciliations.filter((refund) => refund.merchant_trade_no === item.merchant_trade_no).reduce((sum, refund) => sum + refund.amount, 0)),
            })).filter((item) => item.net_amount > 0 && (item.public_name || item.public_message || item.public_amount)),
          };
        }
        if (normalized.startsWith('SELECT day, SUM(amount)')) {
          const days = new Map();
          for (const row of db.contributions) { const day = row.created_at.slice(0, 10); days.set(day, (days.get(day) || 0) + row.amount); }
          for (const row of db.reconciliations) { const day = row.created_at.slice(0, 10); days.set(day, (days.get(day) || 0) - row.amount); }
          return { results: [...days].sort(([left], [right]) => left.localeCompare(right)).map(([day, amount]) => ({ day, amount })) };
        }
        return { results: [] };
      },
      async run() {
        if (normalized.startsWith('INSERT INTO ecpay_support_checkout_requests')) {
          db.checkout = { id: values[0], merchant_trade_no: values[1], expected_amount: values[2], public_name: values[3], public_message: values[4], public_amount: values[5], public_display_name: values[6], public_message_text: values[7], status: 'pending' }; return changed(1);
        }
        if (normalized.startsWith('INSERT OR IGNORE INTO ecpay_support_contributions')) {
          if (db.contributions.some((item) => item.merchant_trade_no === values[0] || item.trade_no === values[1] || item.checkout_request_id === values[2])) return changed(0);
          db.contributions.push({ merchant_trade_no: values[0], trade_no: values[1], checkout_request_id: values[2], amount: values[3], public_name: values[4], public_message: values[5], public_amount: values[6], public_display_name: values[7], public_message_text: values[8], created_at: '2026-09-01 10:00:00' }); return changed(1);
        }
        if (normalized.startsWith('UPDATE ecpay_support_checkout_requests')) { db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed'; return changed(1); }
        return changed(0);
      },
    }; } };
  }
}
function changed(count) { return { success: true, meta: { changes: count } }; }
