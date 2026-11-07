import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getKofiSupportTotals, handleKofiWebhook, isKofiWebhookConfigured } from '../src/kofi.js';
import { renderSupportPage } from '../src/pages.js';
import { escapeHtml } from '../src/http.js';

const KOFI_TOKEN = 'kofi-webhook-token-0123456789abcdef';

describe('Ko-fi donation webhook', () => {
  it('fails closed without a usable verification token', async () => {
    expect(isKofiWebhookConfigured({})).toBe(false);
    expect(isKofiWebhookConfigured({ KOFI_WEBHOOK_TOKEN: 'short' })).toBe(false);
    const db = new KofiDb();
    expect((await handleKofiWebhook(validRequest(donationPayload()), { KOFI_WEBHOOK_TOKEN: '' })).status).toBe(503);
    expect((await handleKofiWebhook(validRequest(donationPayload()), { KOFI_WEBHOOK_TOKEN: 'short', pure_link_db: db })).status).toBe(503);
    expect(db.queries).toBe(0);
  });

  it('records a verified one-time donation as a private receipt', async () => {
    const db = new KofiDb();
    const response = await handleKofiWebhook(validRequest(donationPayload()), environment(db));
    expect(response.status).toBe(200);
    expect(db.donations).toHaveLength(1);
    expect(db.donations[0]).toMatchObject({
      kofi_transaction_id: '00000000-1111-2222-3333-444444444444',
      kofi_message_id: '3f8c1f2a-4c3d-4e5f-a1b2-1234567890ab',
      receipt_type: 'donation',
      amount_minor: 500,
      amount_text: '5.00',
      currency: 'USD',
      paid_at: '2026-10-31T10:20:30Z',
      attribution_state: 'private',
      public_name: 0,
      public_message: 0,
      public_amount: 0,
      public_display_name: null,
      public_message_text: null,
    });
    expect(db.events).toEqual([expect.objectContaining({ event_key: 'kofi:3f8c1f2a-4c3d-4e5f-a1b2-1234567890ab', received_event: 'donation' })]);
    expect(JSON.stringify(db.donations)).not.toContain('supporter@example.com');
    expect(JSON.stringify(db.donations)).not.toContain('Great tool');
    await expect(getKofiSupportTotals(db)).resolves.toEqual({ publicSupporters: [] });
  });

  it('converts decimal amounts to minor units without floating-point arithmetic', async () => {
    for (const [amount, minor] of [['5', 500], ['5.00', 500], ['12.50', 1250], ['12.5', 1250], ['12345.67', 1234567], ['0.01', 1]]) {
      const db = new KofiDb();
      const amountId = 'tx-amount-' + amount.replace('.', '-');
      const body = validRequest(donationPayload({ amount, kofi_transaction_id: amountId }));
      expect((await handleKofiWebhook(body, environment(db))).status).toBe(200);
      expect(db.donations[0].amount_minor).toBe(minor);
    }
  });

  it('rejects a missing or wrong verification token without reading the database', async () => {
    const db = new KofiDb();
    const missing = donationPayload();
    delete missing.verification_token;
    expect((await handleKofiWebhook(validRequest(missing), environment(db))).status).toBe(401);
    expect((await handleKofiWebhook(validRequest(donationPayload({ verification_token: 'wrong-token-value-000000000' })), environment(db))).status).toBe(401);
    expect(db.queries).toBe(0);
    // A token in the query string is never accepted; only the payload token is.
    const request = new Request('https://no-no.uk/api/webhooks/kofi?token=' + encodeURIComponent(KOFI_TOKEN), validRequestInit(donationPayload({ verification_token: 'wrong-token-value-000000000' })));
    expect((await handleKofiWebhook(request, environment(db))).status).toBe(401);
    expect(db.queries).toBe(0);
  });

  it('rejects absent or malformed form data and unexpected payloads', async () => {
    const db = new KofiDb();
    const send = (init, headers) => handleKofiWebhook(new Request('https://no-no.uk/api/webhooks/kofi', { method: 'POST', ...init, headers }), environment(db));
    expect((await send({ body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(400);
    const doubled = 'data=' + encodeURIComponent(donationJson()) + '&data=' + encodeURIComponent('{"type":"Donation"}');
    expect((await send({ body: doubled, headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(400);
    for (const data of ['not-json', '{"no":', '[1,2,3]', '"text"', '123', 'null']) {
      expect((await send({ body: 'data=' + encodeURIComponent(data), headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(400);
    }
    expect((await send({ body: 'data=' + encodeURIComponent(donationJson()), headers: { 'content-type': 'application/json' } })).status).toBe(400);
    expect(db.queries).toBe(0);
  });

  it('safely ignores undocumented Ko-fi fields so future schema extensions never affect decisions', async () => {
    const db = new KofiDb();
    const payload = donationPayload({
      creator_notice: 'thanks for using ko-fi',
      kofi_transaction_id_secondary: '99999999-8888-7777-6666-555544443333',
      public_consent_override: true,
      refunded: 100,
      subscription_status: 'active',
      __proto__: { admin: true },
    });
    const { ['__proto__']: _ignored, ...safePayload } = payload;
    expect((await handleKofiWebhook(validRequest(safePayload), environment(db))).status).toBe(200);
    expect(db.donations).toHaveLength(1);
    expect(db.donations[0]).toMatchObject({ receipt_type: 'donation', amount_minor: 500, currency: 'USD', attribution_state: 'private' });
    await expect(getKofiSupportTotals(db)).resolves.toEqual({ publicSupporters: [] });
    // Additional unknown fields on replay can neither break idempotency nor
    // mutate the recorded transaction.
    const replay = { ...safePayload, unknown_extension: { nested: ['x'] } };
    expect((await handleKofiWebhook(validRequest(replay), environment(db))).status).toBe(200);
    expect(db.donations).toHaveLength(1);
    expect(db.donations[0].amount_text).toBe('5.00');
    expect(db.events).toHaveLength(1);
  });

  it('tolerates null and absent optional fields outside the documented required set', async () => {
    const db = new KofiDb();
    const payload = donationPayload({ message: null, from_name: null, url: '', tier_name: null, shop_items: null, shipping: null });
    delete payload.email;
    delete payload.is_public;
    expect((await handleKofiWebhook(validRequest(payload), environment(db))).status).toBe(200);
    expect(db.donations[0]).toMatchObject({ receipt_type: 'donation', amount_minor: 500 });
    expect(JSON.stringify(db.donations)).not.toContain('email');
  });

  it('rejects oversized bodies before parsing', async () => {
    const db = new KofiDb();
    const oversized = donationPayload({ message: 'x'.repeat(9000) });
    expect((await handleKofiWebhook(validRequest(oversized), environment(db))).status).toBe(413);
    expect(db.queries).toBe(0);
  });

  it('validates amount, currency, timestamp, and identifiers before storing', async () => {
    const db = new KofiDb();
    for (const patch of [
      { amount: '0.00' }, { amount: '-1.00' }, { amount: '1.005' }, { amount: '1,234' }, { amount: ' ' }, { amount: 500 }, { amount: '123456789' },
      { currency: 'usd' }, { currency: 'USDT' }, { currency: 'US' }, { currency: '' },
      { timestamp: '2026-13-40T10:20:30Z' }, { timestamp: '2026-01-02T03:04:05' }, { timestamp: 'Nov 2 2026' }, { timestamp: '' },
      { kofi_transaction_id: 'inv.alid' }, { kofi_transaction_id: '' },
      { message_id: '' }, { message_id: 'has space 012' },
    ]) {
      const response = await handleKofiWebhook(validRequest(donationPayload(patch)), environment(db));
      if (response.status !== 400) throw new Error(`expected 400 for ${JSON.stringify(patch)}`);
    }
    expect(db.queries).toBe(0);
  });

  it('treats repeated delivery and replays as idempotent', async () => {
    const db = new KofiDb();
    const payload = donationPayload();
    expect((await handleKofiWebhook(validRequest(payload), environment(db))).status).toBe(200);
    expect((await handleKofiWebhook(validRequest(payload), environment(db))).status).toBe(200);
    expect((await handleKofiWebhook(validRequest(payload), environment(db))).status).toBe(200);
    expect(db.donations).toHaveLength(1);
    expect(db.events).toHaveLength(1);
  });

  it('accepts the same transaction identifier with a new message id at identical content once', async () => {
    const db = new KofiDb();
    const payload = donationPayload();
    await handleKofiWebhook(validRequest(payload), environment(db));
    const replay = donationPayload({ message_id: '77777777-8888-9999-aaaa-bbbbccccdddd' });
    expect((await handleKofiWebhook(validRequest(replay), environment(db))).status).toBe(200);
    expect(db.donations).toHaveLength(1);
    expect(db.donations[0].kofi_message_id).toBe(payload.message_id);
  });

  it('refuses conflicting payloads that reuse a recorded identifier without overwriting', async () => {
    const db = new KofiDb();
    await handleKofiWebhook(validRequest(donationPayload()), environment(db));
    const conflict = await handleKofiWebhook(validRequest(donationPayload({ amount: '25.00', message_id: '77777777-8888-9999-aaaa-bbbbccccdddd' })), environment(db));
    expect(conflict.status).toBe(409);
    expect(db.donations).toHaveLength(1);
    expect(db.donations[0]).toMatchObject({ amount_minor: 500, amount_text: '5.00' });
    const currencyConflict = await handleKofiWebhook(validRequest(donationPayload({ currency: 'EUR' })), environment(db));
    expect(currencyConflict.status).toBe(409);
    expect(db.donations[0].currency).toBe('USD');
  });

  it('preserves unexpected event types without recording donations', async () => {
    const db = new KofiDb();
    expect((await handleKofiWebhook(validRequest(donationPayload({ type: 'Membership' })), environment(db))).status).toBe(400);
    expect((await handleKofiWebhook(validRequest(donationPayload({ type: 'Donation ' })), environment(db))).status).toBe(400);
    expect((await handleKofiWebhook(validRequest(donationPayload({ type: '' })), environment(db))).status).toBe(400);
    expect(db.donations).toHaveLength(0);
    expect(db.events).toHaveLength(0);
  });

  it('ignores membership, shop order, and commission payloads and never grants entitlements', async () => {
    const db = new KofiDb();
    const membership = donationPayload({
      type: 'Subscription',
      is_subscription_payment: true,
      is_first_subscription_payment: true,
      tier_name: 'Gold Tier',
      amount: '6.00',
      currency: 'USD',
    });
    expect((await handleKofiWebhook(validRequest(membership), environment(db))).status).toBe(200);
    expect(db.donations).toHaveLength(0);
    expect(db.creditBalance).toBe(0);
    expect(db.events).toEqual([expect.objectContaining({ received_event: 'membership' })]);
    for (const [type, event] of [['Shop Order', 'shop_order'], ['Commission', 'commission']]) {
      expect((await handleKofiWebhook(validRequest(donationPayload({ type, message_id: `ignored-${event}-${type.split(' ')[0].toLowerCase()}`.padEnd(12, 'x'), kofi_transaction_id: `txn-${event}` })), environment(db))).status).toBe(200);
      expect(db.donations).toHaveLength(0);
      expect(db.creditBalance).toBe(0);
      expect(db.events.at(-1).received_event).toBe(event);
    }
    expect(db.queriesDidNotTouchCredits()).toBe(true);
  });

  it('requires strict booleans before classifying recurring donations', async () => {
    const db = new KofiDb();
    expect((await handleKofiWebhook(validRequest(donationPayload({ is_subscription_payment: 'true', kofi_transaction_id: 'tx-boolean-string' })), environment(db))).status).toBe(400);
    expect((await handleKofiWebhook(validRequest(donationPayload({ is_subscription_payment: true, kofi_transaction_id: 'tx-recurring-donation' })), environment(db))).status).toBe(200);
    expect(db.donations[0].receipt_type).toBe('recurring_donation');
    expect(db.donations[0].receipt_type).not.toBe('donation');
    expect(db.donations).toHaveLength(1);
    expect(db.creditBalance).toBe(0);
  });

  it('keeps receipts private until operator attribution is recorded', async () => {
    const db = new KofiDb();
    await handleKofiWebhook(validRequest(donationPayload({ from_name: '<script>alert(1)</script>', message: 'thanks @everyone\nline two' })), environment(db));
    expect(db.donations[0].public_display_name).toBeNull();
    expect(db.donations[0].public_message_text).toBeNull();
    await expect(getKofiSupportTotals(db)).resolves.toEqual({ publicSupporters: [] });
  });

  it('renders only operator-authorized attributions, escaped, in the receipt currency', async () => {
    const db = new KofiDb();
    await handleKofiWebhook(validRequest(donationPayload({ amount: '12.50', currency: 'USD' })), environment(db));
    db.authorize(db.donations[0].kofi_transaction_id, { name: '<script>alert(1)</script>', message: 'thanks @everyone' });
    const totals = await getKofiSupportTotals(db);
    expect(totals.publicSupporters).toEqual([{ name: '<script>alert(1)</script>', message: 'thanks @\u200Beveryone', amountText: '12.50', currency: 'USD' }]);
    const html = renderSupportPage({ netTwd: 300, contributionCount: 2, netUsdMinor: 0, history: [], ...totals }, {}, '', '', 'en');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('thanks @\u200Beveryone');
    expect(html).toContain('$12.50');
    expect(html).toContain('NT$300');
  });

  it('never sums donation currencies on the support page', async () => {
    const html = renderSupportPage({
      netTwd: 500, netUsdMinor: 1000, contributionCount: 3, history: [],
      publicSupporters: [
        { name: 'TWD supporter', message: '', amount: 500 },
        { name: 'USD supporter', message: '', amountText: '12.50', currency: 'USD' },
        { name: 'EUR supporter', message: '', amountText: '5.00', currency: 'EUR' },
      ],
    }, {}, '', '', 'en');
    expect(html).toContain('NT$500');
    expect(html).toContain('$10.00');
    expect(html).not.toMatch(/(?:\$10\.00|NT\$500)[^<]*(?:5\.00|€)/);
  });
});

describe('Ko-fi donation schema and refund ledger guards', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0014_kofi_donations.sql', import.meta.url), 'utf8'));

  function insertDonation(db, overrides = {}) {
    const donation = {
      transaction_id: '00000000-1111-2222-3333-444444444444',
      message_id: '3f8c1f2a-4c3d-4e5f-a1b2-1234567890ab',
      receipt_type: 'donation',
      amount_minor: 1250,
      amount_text: '12.50',
      currency: 'USD',
      paid_at: '2026-10-31T10:20:30Z',
      ...overrides,
    };
    db.prepare('INSERT OR IGNORE INTO kofi_donations (kofi_transaction_id, kofi_message_id, receipt_type, amount_minor, amount_text, currency, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(donation.transaction_id, donation.message_id, donation.receipt_type, donation.amount_minor, donation.amount_text, donation.currency, donation.paid_at);
    return donation;
  }

  it('rejects conflicting content on an existing identifier and admits identical redelivery', () => {
    insertDonation(db);
    const ignored = db.prepare('INSERT OR IGNORE INTO kofi_donations (kofi_transaction_id, kofi_message_id, receipt_type, amount_minor, amount_text, currency, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('00000000-1111-2222-3333-444444444444', '88888888-9999-0000-1111-222233334444', 'donation', 9900, '99.00', 'USD', '2026-10-31T10:20:30Z');
    expect(Number(ignored.changes)).toBe(0);
    expect(db.prepare('SELECT amount_minor, kofi_message_id FROM kofi_donations WHERE kofi_transaction_id = ?').get('00000000-1111-2222-3333-444444444444').amount_minor).toBe(1250);
    const redelivery = db.prepare('INSERT OR IGNORE INTO kofi_donations (kofi_transaction_id, kofi_message_id, receipt_type, amount_minor, amount_text, currency, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('new-txn-Identifier-00000000001', '3f8c1f2a-4c3d-4e5f-a1b2-1234567890ab', 'donation', 1250, '12.50', 'USD', '2026-10-31T10:20:30Z');
    expect(Number(redelivery.changes)).toBe(0);
  });

  it('keeps new receipts private and refuses public text without authorization', () => {
    insertDonation(db, { transaction_id: 'new-transaction-0000000000002', message_id: 'new-message-00000000000002', currency: 'EUR' });
    expect(() => db.prepare("UPDATE kofi_donations SET public_name = 1, public_display_name = 'nasa' WHERE kofi_transaction_id = 'new-transaction-0000000000002'").run())
      .toThrow(/CHECK constraint failed/);
    expect(db.prepare("SELECT attribution_state FROM kofi_donations WHERE kofi_transaction_id = 'new-transaction-0000000000002'").get().attribution_state).toBe('private');
  });

  it('guards the ledger against unknown donations, excess refunds, and currency mismatches', () => {
    insertDonation(db, { transaction_id: 'ledger-transaction-00000003', message_id: 'ledger-message-0000000003', amount_minor: 1000 });
    expect(() => db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r0', 'unknown-txn-identifier-0009', 'refund', 1, 'USD', 'note')")
      .run()).toThrow(/Unknown Ko-fi donation/);
    expect(() => db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r1', 'ledger-transaction-00000003', 'refund', 2, 'EUR', 'ops note')")
      .run()).toThrow(/currency mismatch/);
    expect(() => db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r2', 'ledger-transaction-00000003', 'refund', 1001, 'USD', 'excess')")
      .run()).toThrow(/exceeds donation amount/);
  });

  it('allows cumulative verified refunds up to the donation and hides fully refunded supporters', async () => {
    const txn = 'ledger-transaction-00000004';
    insertDonation(db, { transaction_id: txn, message_id: 'ledger-message-0000000004', amount_minor: 1000 });
    insertDonation(db, { transaction_id: 'ledger-transaction-00000005', message_id: 'ledger-message-0000000005', amount_minor: 500 });
    db.prepare("UPDATE kofi_donations SET attribution_state = 'authorized', public_name = 1, public_display_name = 'operator', public_amount = 1 WHERE kofi_transaction_id IN (?, ?)").run(txn, 'ledger-transaction-00000005');
    const totalAdapter = d1From(db);
    db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r3', ?, 'refund', 300, 'USD', 'partial')").run(txn);
    db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r4', ?, 'refund', 700, 'USD', 'remainder from PayPal console')").run(txn);
    expect(() => db.prepare("INSERT INTO kofi_refund_reconciliations (id, kofi_transaction_id, kind, amount_minor, currency, note) VALUES ('r5', ?, 'refund', 1, 'USD', 'one over')")
      .run(txn)).toThrow(/exceeds donation amount/);
    const totals = await getKofiSupportTotals(totalAdapter);
    expect(totals.publicSupporters).toEqual([expect.objectContaining({ name: 'operator', amountText: '5.00', currency: 'USD' })]);
  });
});

function donationPayload(overrides = {}) {
  return {
    message_id: '3f8c1f2a-4c3d-4e5f-a1b2-1234567890ab',
    type: 'Donation',
    is_public: true,
    from_name: 'Anonymous supporter',
    message: 'Great tool',
    amount: '5.00',
    url: 'https://ko-fi.com/purelink',
    email: 'supporter@example.com',
    currency: 'USD',
    timestamp: '2026-10-31T10:20:30Z',
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: '00000000-1111-2222-3333-444444444444',
    tier_name: null,
    verification_token: KOFI_TOKEN,
    shop_items: null,
    shipping: null,
    ...overrides,
  };
}

function donationJson(payload = donationPayload()) { return JSON.stringify(payload); }

function validRequestInit(payload) {
  const body = 'data=' + encodeURIComponent(donationJson(payload));
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body };
}

function validRequest(payload) { return new Request('https://no-no.uk/api/webhooks/kofi', { method: 'POST', ...validRequestInit(payload) }); }

function environment(db) { return { KOFI_WEBHOOK_TOKEN: KOFI_TOKEN, pure_link_db: db }; }

function d1From(db) {
  return {
    prepare(sql) { const statement = db.prepare(sql); return { bind(...values) { const full = statement.all.bind(statement); return { async all() { return { results: full(...values) }; } }; } }; },
  };
}

class KofiDb {
  constructor() {
    this.donations = [];
    this.events = [];
    this.creditBalance = 0;
    this.queries = 0;
  }

  authorize(transactionId, { name, message }) {
    const donation = this.donations.find((item) => item.kofi_transaction_id === transactionId);
    if (!donation) throw new Error('authorize: unknown donation');
    donation.attribution_state = 'authorized';
    donation.public_name = 1;
    donation.public_display_name = name;
    donation.public_message = 1;
    donation.public_message_text = message;
    donation.public_amount = 1;
  }

  queriesDidNotTouchCredits() {
    return this.donations.every((item) => !('credits' in item) && !('user_id' in item) && !('pack_id' in item)) && this.creditBalance === 0;
  }

  prepare(sql) {
    this.queries += 1;
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    return { bind(...values) { return {
      async first() {
        if (normalized.startsWith('SELECT kofi_transaction_id, kofi_message_id')) return db.donations.find((item) => item.kofi_transaction_id === values[0]) || null;
        return null;
      },
      async all() {
        if (normalized.startsWith('SELECT donation.public_name')) {
          return {
            results: db.donations
              .filter((item) => item.attribution_state === 'authorized'
                && (item.public_name === 1 || item.public_message === 1 || item.public_amount === 1)
                && item.amount_minor > item.refunded_minor)
              .map((item) => ({ ...item, net_amount_minor: item.amount_minor - item.refunded_minor })),
          };
        }
        return { results: [] };
      },
      async run() {
        if (normalized.startsWith('INSERT OR IGNORE INTO kofi_donations')) {
          if (db.donations.some((item) => item.kofi_transaction_id === values[0] || item.kofi_message_id === values[1])) return changed(0);
          db.donations.push({
            kofi_transaction_id: values[0], kofi_message_id: values[1], receipt_type: values[2], amount_minor: values[3],
            amount_text: values[4], currency: values[5], paid_at: values[6],
            attribution_state: 'private', public_amount: 0, public_name: 0, public_message: 0,
            public_display_name: null, public_message_text: null, refunded_minor: 0,
          });
          return changed(1);
        }
        if (normalized.startsWith('INSERT OR IGNORE INTO kofi_webhook_events')) {
          if (db.events.some((item) => item.event_key === values[0])) return changed(0);
          db.events.push({ event_key: values[0], message_id: values[1], received_event: values[2] });
          return changed(1);
        }
        return changed(0);
      },
    }; } };
  }
}

function changed(count) { return { success: true, meta: { changes: count } }; }
