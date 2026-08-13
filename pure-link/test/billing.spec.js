import { describe, expect, it, vi } from 'vitest';
import {
  CREEM_PRODUCT_300_ID,
  createCheckout,
  handleCreemWebhook,
  verifyCreemSignature,
} from '../src/billing.js';

describe('Creem billing', () => {
  it('creates checkout server-side with account metadata and no stored secret', async () => {
    const db = new BillingDb();
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      checkout_url: 'https://checkout.creem.io/ch_test',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await createCheckout({
      requestUrl: new URL('https://no-no.uk/account'),
      user: { id: 'user-1', email: 'person@example.com' },
      env: {
        pure_link_db: db,
        CREEM_API_KEY: 'secret-api-key',
        CREEM_WEBHOOK_SECRET: 'webhook-secret',
        PUBLIC_ORIGIN: 'https://no-no.uk',
      },
      fetchImplementation,
    });

    expect(result.checkoutUrl).toBe('https://checkout.creem.io/ch_test');
    expect(db.checkout.user_id).toBe('user-1');
    const [, options] = fetchImplementation.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(options.headers['x-api-key']).toBe('secret-api-key');
    expect(body).toMatchObject({
      product_id: CREEM_PRODUCT_300_ID,
      units: 1,
      customer: { email: 'person@example.com' },
      metadata: { purelink_user_id: 'user-1', purelink_credits: 300 },
    });
    expect(JSON.stringify(db)).not.toContain('secret-api-key');
  });

  it('verifies the raw request body with HMAC-SHA256', async () => {
    const body = '{"eventType":"checkout.completed"}';
    const signature = await sign(body, 'webhook-secret');
    expect(await verifyCreemSignature(body, signature, 'webhook-secret')).toBe(true);
    expect(await verifyCreemSignature(`${body} `, signature, 'webhook-secret')).toBe(false);
  });

  it('grants a checkout only once and reverses remaining credits on refund', async () => {
    const db = new BillingDb();
    db.checkout = {
      id: 'checkout-1', user_id: 'user-1', product_id: CREEM_PRODUCT_300_ID, credits: 300, status: 'pending',
    };
    const env = { pure_link_db: db, CREEM_WEBHOOK_SECRET: 'webhook-secret' };
    const purchase = {
      id: 'evt_purchase1',
      eventType: 'checkout.completed',
      object: {
        status: 'completed',
        request_id: 'checkout-1',
        product: { id: CREEM_PRODUCT_300_ID },
        order: { id: 'ord_purchase1', product: CREEM_PRODUCT_300_ID, amount: 500, currency: 'USD', status: 'paid' },
      },
    };

    expect((await handleCreemWebhook(await webhookRequest(purchase, env.CREEM_WEBHOOK_SECRET), env)).status).toBe(200);
    expect(db.balance).toBe(300);
    await handleCreemWebhook(await webhookRequest(purchase, env.CREEM_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(300);

    db.balance = 240;
    const refund = {
      id: 'evt_refund1',
      eventType: 'refund.created',
      object: {
        refund_amount: 500,
        transaction: { order: 'ord_purchase1', amount_paid: 500, refunded_amount: 500 },
        order: { id: 'ord_purchase1' },
      },
    };
    await handleCreemWebhook(await webhookRequest(refund, env.CREEM_WEBHOOK_SECRET), env);
    expect(db.balance).toBe(0);
    expect(db.order.credits_refunded).toBe(300);
  });

  it('rejects unsigned webhook payloads before touching D1', async () => {
    const db = new BillingDb();
    const response = await handleCreemWebhook(new Request('https://no-no.uk/api/webhooks/creem', {
      method: 'POST',
      body: '{}',
      headers: { 'creem-signature': '0'.repeat(64) },
    }), { pure_link_db: db, CREEM_WEBHOOK_SECRET: 'secret' });
    expect(response.status).toBe(401);
    expect(db.queries).toBe(0);
  });
});

async function webhookRequest(payload, secret) {
  const body = JSON.stringify(payload);
  return new Request('https://no-no.uk/api/webhooks/creem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'creem-signature': await sign(body, secret) },
    body,
  });
}

async function sign(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

class BillingDb {
  constructor() {
    this.checkout = null;
    this.order = null;
    this.balance = 0;
    this.events = new Set();
    this.queries = 0;
  }

  prepare(sql) {
    this.queries += 1;
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    const statement = {
      bind(...values) {
        return {
          async first() {
            if (normalized.startsWith('SELECT id, user_id, product_id')) return db.checkout?.id === values[0] ? db.checkout : null;
            if (normalized.startsWith('SELECT provider_order_id')) return db.order?.provider_order_id === values[0] ? db.order : null;
            return null;
          },
          async run() {
            if (normalized.startsWith('INSERT INTO billing_checkout_requests')) {
              db.checkout = { id: values[0], user_id: values[1], product_id: values[2], credits: values[3], status: 'pending' };
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO billing_orders')) {
              if (db.order) return changed(0);
              db.order = {
                provider_order_id: values[0], credits_total: values[5], credits_refunded: 0, amount: values[6],
              };
              db.balance += values[5];
              return changed(1);
            }
            if (normalized.startsWith('UPDATE billing_checkout_requests')) {
              if (db.checkout) db.checkout.status = normalized.includes("'failed'") ? 'failed' : 'completed';
              return changed(1);
            }
            if (normalized.startsWith('UPDATE billing_orders')) {
              const nextRefunded = Math.max(db.order.credits_refunded, values[0]);
              db.balance = Math.max(0, db.balance - (nextRefunded - db.order.credits_refunded));
              db.order.credits_refunded = nextRefunded;
              return changed(1);
            }
            if (normalized.startsWith('INSERT OR IGNORE INTO billing_events')) {
              db.events.add(values[0]);
              return changed(1);
            }
            return changed(0);
          },
        };
      },
      async run() { return changed(0); },
    };
    return statement;
  }
}

function changed(count) {
  return { success: true, meta: { changes: count } };
}
