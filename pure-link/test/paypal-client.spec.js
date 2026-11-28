import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAYPAL_API_ORIGINS,
  PayPalApiError,
  capturePaypalOrder,
  createPaypalOrder,
  getPaypalCapture,
  getPaypalOrder,
  getPaypalRefund,
  isPaypalClientConfigured,
  minorUnitsToDecimalString,
  paypalApiOrigin,
  paypalApproveUrl,
  verifyPaypalWebhookSignature,
} from '../src/paypal-client.js';

const sandboxEnv = {
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_CLIENT_ID: 'sandbox-client-id-0000000001',
  PAYPAL_CLIENT_SECRET: 'sandbox-client-secret-000000000001',
};
const liveEnv = {
  PAYPAL_ENVIRONMENT: 'production',
  PAYPAL_CLIENT_ID: 'live-client-id-000000000000001',
  PAYPAL_CLIENT_SECRET: 'live-client-secret-0000000000000001',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function oauthResponse() {
  return jsonResponse({ access_token: 'test-access-token', expires_in: 32400 });
}

// Records calls and answers per path pattern.
function fetchMock(handlers = [], options = {}) {
  const calls = [];
  const implementation = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', init });
    for (const [match, response] of handlers) {
      if (String(url).includes(match)) return typeof response === 'function' ? response(calls.at(-1)) : response;
    }
    return jsonResponse({ message: 'not found' }, 404);
  };
  implementation.calls = calls;
  return implementation;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PayPal client configuration', () => {
  it('is fail-closed on missing or malformed credentials', () => {
    expect(isPaypalClientConfigured({})).toBe(false);
    expect(isPaypalClientConfigured({ ...sandboxEnv, PAYPAL_ENVIRONMENT: 'live' })).toBe(false);
    expect(isPaypalClientConfigured({ ...sandboxEnv, PAYPAL_CLIENT_ID: '' })).toBe(false);
    expect(isPaypalClientConfigured({ ...sandboxEnv, PAYPAL_CLIENT_SECRET: 'short' })).toBe(false);
    expect(isPaypalClientConfigured(sandboxEnv)).toBe(true);
  });

  it('resolves exactly one hardcoded API origin per environment with no fallback', () => {
    expect(paypalApiOrigin('sandbox')).toBe('https://api-m.sandbox.paypal.com');
    expect(paypalApiOrigin('production')).toBe('https://api-m.paypal.com');
    expect(paypalApiOrigin('live')).toBeNull();
    expect(paypalApiOrigin('')).toBeNull();
    expect(Object.isFrozen(PAYPAL_API_ORIGINS)).toBe(true);
  });
});

describe('PayPal client requests', () => {
  it('authenticates with client credentials, caches the token, and hits only the sandbox origin', async () => {
    const implementation = fetchMock([
      ['/v1/oauth2/token', (call) => {
        expect(call.init.method).toBe('POST');
        expect(call.init.body).toBe('grant_type=client_credentials');
        const authorization = call.init.headers.authorization;
        expect(authorization.startsWith('Basic ')).toBe(true);
        expect(authorization).not.toContain('sandbox-client-id-0000000001@');
        return oauthResponse();
      }],
      ['/v2/checkout/orders', jsonResponse({ id: 'ORDER-1', status: 'CREATED' })],
    ]);
    await createPaypalOrder({ env: sandboxEnv, amountMinor: 500, referenceId: 'pl-sup-test', requestId: 'cre-test', returnUrl: 'https://no-no.uk/api/payment-return/paypal-support', cancelUrl: 'https://no-no.uk/en/support', fetchImplementation: implementation });
    await createPaypalOrder({ env: sandboxEnv, amountMinor: 1000, referenceId: 'pl-sup-test2', requestId: 'cre-test2', returnUrl: 'https://no-no.uk/api/payment-return/paypal-support', cancelUrl: 'https://no-no.uk/en/support', fetchImplementation: implementation });
    expect(implementation.calls.filter((call) => call.url.includes('/v1/oauth2/token'))).toHaveLength(1);
    for (const call of implementation.calls) {
      expect(call.url.startsWith('https://api-m.sandbox.paypal.com/')).toBe(true);
      expect(call.url.startsWith('https://api-m.paypal.com/')).toBe(false);
    }
  });

  it('sends the exact minor-unit amount and the request id header', async () => {
    const implementation = fetchMock([
      ['/v2/checkout/orders', (call) => {
        const body = JSON.parse(call.init.body);
        expect(body.intent).toBe('CAPTURE');
        expect(body.purchase_units).toHaveLength(1);
        expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '5.00' });
        expect(call.init.headers['paypal-request-id']).toBe('cre-check');
        return jsonResponse({ id: 'ORDER-2', links: [] });
      }],
    ]);
    await createPaypalOrder({ env: sandboxEnv, amountMinor: 500, referenceId: 'pl-sup-ref', requestId: 'cre-check', returnUrl: 'https://no-no.uk/return', cancelUrl: 'https://no-no.uk/cancel', fetchImplementation: implementation });
    // Only the order call happens here: the client-credentials token is cached
    // from the first test (same environment + client id cache key).
    expect(implementation.calls).toHaveLength(1);
  });

  it('keeps sandbox and live traffic strictly separated', async () => {
    const implementation = fetchMock([
      ['/v1/oauth2/token', oauthResponse()],
      ['/v2/checkout/orders', jsonResponse({ id: 'ORDER-LIVE' })],
    ]);
    await getPaypalOrder({ env: liveEnv, orderId: 'ORDER-LIVE', fetchImplementation: implementation });
    await getPaypalOrder({ env: sandboxEnv, orderId: 'ORDER-SBX', fetchImplementation: implementation });
    expect(implementation.calls[implementation.calls.length - 2].url.startsWith('https://api-m.paypal.com/')).toBe(true);
    expect(implementation.calls.at(-1).url.startsWith('https://api-m.sandbox.paypal.com/')).toBe(true);
  });

  it('maps network and timeout failures to sanitized errors without leaking payloads', async () => {
    const failing = async () => { throw new Error('ECONNRESET raw socket detail'); };
    await expect(getPaypalOrder({ env: sandboxEnv, orderId: 'ORDER-1', fetchImplementation: failing })).rejects.toMatchObject({ name: 'PayPalApiError', status: null, issue: 'PayPal API request failed' });
    const timingOut = async (url, init) => { throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }); };
    await expect(getPaypalOrder({ env: sandboxEnv, orderId: 'ORDER-1', fetchImplementation: timingOut })).rejects.toMatchObject({ issue: 'PayPal API request timed out' });
  });

  it('reports provider failures with sanitized issues and never includes tokens', async () => {
    const implementation = fetchMock([
      ['/v2/checkout/orders', jsonResponse({ message: 'Invalid request - amount is malformed', debug_id: 'abc123' }, 400)],
    ]);
    let error;
    try {
      await capturePaypalOrder({ env: sandboxEnv, orderId: 'ORDER-1', requestId: 'cap-x', fetchImplementation: implementation });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error.status).toBe(400);
    expect(error.issue).toBe('Invalid request - amount is malformed');
    expect(error.message).not.toContain('Bearer');
    expect(error.message).not.toContain('test-access-token');
  });

  it('refreshes a stale token once on a 401 and does not retry beyond that', async () => {
    // A dedicated client id starts with a cold cache, so the capture 401 and
    // the single forced refresh are both exercised deterministically.
    const coldEnv = { ...sandboxEnv, PAYPAL_CLIENT_ID: 'cold-client-id-00000000001' };
    const implementation = fetchMock([
      ['/v1/oauth2/token', () => oauthResponse()],
      ['/v2/payments/captures/CAP-1', (call) => {
        const unauthorized = implementation.calls.filter((item) => item.url.includes('/v1/oauth2/token')).length < 2;
        return jsonResponse({ message: 'invalid token' }, unauthorized ? 401 : 200);
      }],
    ]);
    const capture = await getPaypalCapture({ env: coldEnv, captureId: 'CAP-1', fetchImplementation: implementation });
    expect(capture).toEqual({ message: 'invalid token' });
    expect(implementation.calls.filter((call) => call.url.includes('/v1/oauth2/token'))).toHaveLength(2);
    expect(implementation.calls.filter((call) => call.url.includes('/v2/payments/captures/CAP-1'))).toHaveLength(2);
  });

  it('supports refund lookup and bounded resource ids', async () => {
    const implementation = fetchMock([
      ['/v2/payments/refunds/', jsonResponse({ id: 'REF-1', status: 'COMPLETED' })],
    ]);
    const refund = await getPaypalRefund({ env: sandboxEnv, refundId: 'REF-1', fetchImplementation: implementation });
    expect(refund.status).toBe('COMPLETED');
    await expect(getPaypalRefund({ env: sandboxEnv, refundId: '../orders', fetchImplementation: implementation })).rejects.toBeInstanceOf(PayPalApiError);
    await expect(getPaypalOrder({ env: sandboxEnv, orderId: 'x', fetchImplementation: implementation })).rejects.toBeInstanceOf(PayPalApiError);
  });
});

describe('PayPal webhook signature verification (remote API)', () => {
  it('posts the documented fields to the verify-webhook-signature API and returns the verdict', async () => {
    const implementation = fetchMock([
      ['/v1/notifications/verify-webhook-signature', (call) => {
        const body = JSON.parse(call.init.body);
        expect(body.webhook_id).toBe('webhook-id-0000000001');
        expect(body.auth_algo).toBe('SHA256withRSA');
        expect(body.cert_url).toBe('https://api.paypal.com/v1/notifications/certs/CERT-1');
        expect(body.transmission_id).toBe('trans-1');
        expect(body.transmission_sig).toBe('sig-1');
        expect(body.transmission_time).toBe('2026-11-27T00:00:00Z');
        expect(body.webhook_event).toEqual({ id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });
        return jsonResponse({ verification_status: 'SUCCESS' });
      }],
    ]);
    const verified = await verifyPaypalWebhookSignature({
      env: { ...sandboxEnv, PAYPAL_WEBHOOK_ID: 'webhook-id-0000000001' },
      webhookEvent: { id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
      transmission: { authAlgo: 'SHA256withRSA', certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT-1', transmissionId: 'trans-1', transmissionSig: 'sig-1', transmissionTime: '2026-11-27T00:00:00Z' },
      fetchImplementation: implementation,
    });
    expect(verified).toBe(true);
  });

  it('treats FAILURE as unverified and verification outages as errors (fail closed)', async () => {
    const failing = fetchMock([['/v1/notifications/verify-webhook-signature', jsonResponse({ verification_status: 'FAILURE' })]]);
    await expect(verifyPaypalWebhookSignature({
      env: sandboxEnv, webhookEvent: {}, transmission: {}, fetchImplementation: failing,
    })).resolves.toBe(false);
    const outage = fetchMock([]);
    await expect(verifyPaypalWebhookSignature({
      env: sandboxEnv, webhookEvent: {}, transmission: {}, fetchImplementation: outage,
    })).rejects.toBeInstanceOf(PayPalApiError);
  });
});

describe('PayPal approval URL allowlisting', () => {
  const order = { id: 'ORDER-9', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9' }] };

  it('rebuilds the sandbox approval URL from validated parts', () => {
    expect(paypalApproveUrl(order, 'sandbox')).toBe('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9');
  });

  it.each([
    ['wrong environment origin', { ...order, links: [{ rel: 'payer-action', href: 'https://www.paypal.com/checkoutnow?token=ORDER-9' }] }, 'sandbox'],
    ['non-https origin', { ...order, links: [{ rel: 'payer-action', href: 'http://www.sandbox.paypal.com/checkoutnow?token=ORDER-9' }] }, 'sandbox'],
    ['token mismatch', { ...order, links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-OTHER' }] }, 'sandbox'],
    ['foreign host', { ...order, links: [{ rel: 'payer-action', href: 'https://evil.example/checkoutnow?token=ORDER-9' }] }, 'sandbox'],
    ['missing link', { id: 'ORDER-9', links: [] }, 'sandbox'],
  ])('rejects %s', (_label, candidate, environment) => {
    expect(paypalApproveUrl(candidate, environment)).toBe('');
  });

  it('strips unexpected query parameters by rebuilding from validated parts', () => {
    expect(paypalApproveUrl({ ...order, links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9&x=1' }] }, 'sandbox')).toBe('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9');
  });

  it('accepts the documented rel names for both environments', () => {
    expect(paypalApproveUrl({ ...order, links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=ORDER-9' }] }, 'production')).toBe('https://www.paypal.com/checkoutnow?token=ORDER-9');
  });
});

describe('minor-unit formatting', () => {
  it('formats exact decimal strings without floating-point arithmetic', () => {
    expect(minorUnitsToDecimalString(500)).toBe('5.00');
    expect(minorUnitsToDecimalString(300)).toBe('3.00');
    expect(minorUnitsToDecimalString(30000)).toBe('300.00');
    expect(minorUnitsToDecimalString(1234)).toBe('12.34');
    expect(minorUnitsToDecimalString(1)).toBe('0.01');
    expect(() => minorUnitsToDecimalString(-1)).toThrow();
    expect(() => minorUnitsToDecimalString(1.5)).toThrow();
  });
});
