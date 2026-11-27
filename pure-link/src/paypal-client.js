// Minimal server-side PayPal Orders v2 REST client.
//
// Scope is deliberately small: client-credentials OAuth, Orders v2 create /
// get / capture, Payments v2 capture / refund lookups, and the remote Webhook
// signature verification API. It exists for the PayPal voluntary-support rail
// and never touches credit fulfillment.
//
// Security invariants:
// - API origins are environment allowlists. Sandbox can never fall back to
//   Live: each environment resolves to exactly one hardcoded origin.
// - Credentials stay Worker secrets. Access tokens are held in memory only,
//   never logged, never returned, and never included in errors.
// - Every HTTP call has a bounded timeout and exactly one attempt (except a
//   single token refresh on an expired-credential 401). No unbounded retries.
// - Errors carry only sanitized fields (HTTP status, bounded issue text);
//   authorization headers and raw payloads are never re-thrown or logged.
//
// Response-shape note (PayPal "minimal" vs "representation"): POST create
// returns a minimal body (id + HATEOAS links); POST capture and GET calls
// return fuller representations. Parsing below is defensive: whenever a
// caller needs a field the body does not carry, it re-fetches the resource
// instead of guessing.

import { PaymentError } from './payment-error.js';

export const PAYPAL_ENVIRONMENT_SANDBOX = 'sandbox';
export const PAYPAL_ENVIRONMENT_PRODUCTION = 'production';

// Environment-specific, hardcoded allowlists. There is intentionally no
// configuration override for these origins: a misconfigured variable can
// never redirect payment traffic to a host an attacker controls, and sandbox
// credentials can never be pointed at the live API (or vice versa).
export const PAYPAL_API_ORIGINS = Object.freeze({
  sandbox: 'https://api-m.sandbox.paypal.com',
  production: 'https://api-m.paypal.com',
});

// Buyer-facing approval origins that an order's approve link may use. The
// approval URL is re-derived and allowlisted rather than trusted as returned.
export const PAYPAL_CHECKOUT_ORIGINS = Object.freeze({
  sandbox: 'https://www.sandbox.paypal.com',
  production: 'https://www.paypal.com',
});

export const PAYPAL_CURRENCY = 'USD';
const REQUEST_TIMEOUT_MILLISECONDS = 10000;
// OAuth responses arrive quickly; the allowance stays bounded but shorter.
const TOKEN_TIMEOUT_MILLISECONDS = 10000;
const TOKEN_EXPIRY_SAFETY_SECONDS = 60;
const MAX_CLIENT_ID_LENGTH = 200;
const MAX_CLIENT_SECRET_LENGTH = 200;

export class PayPalApiError extends Error {
  // Sanitized constructor: no headers, no tokens, no raw response body. The
  // issue text is trimmed to a bounded diagnostic string.
  constructor({ status, issue, cause } = {}) {
    super(`PayPal API request failed (status ${status ?? 'network'}).`, { cause });
    this.name = 'PayPalApiError';
    this.status = typeof status === 'number' ? status : null;
    this.issue = sanitizeIssue(issue);
  }
}

const accessTokenCache = new Map();

export function paypalEnvironment(env) {
  const value = String(env?.PAYPAL_ENVIRONMENT || '').trim();
  if (value === PAYPAL_ENVIRONMENT_SANDBOX) return PAYPAL_ENVIRONMENT_SANDBOX;
  if (value === PAYPAL_ENVIRONMENT_PRODUCTION) return PAYPAL_ENVIRONMENT_PRODUCTION;
  return null;
}

export function paypalApiOrigin(environment) {
  return PAYPAL_API_ORIGINS[environment] || null;
}

// Common credential/origin gate shared by every PayPal surface. Fail-closed on
// any missing or malformed credential. Environment isolation is structural:
// `sandbox`/`production` each map to their own fixed origin above.
export function isPaypalClientConfigured(env) {
  const environment = paypalEnvironment(env);
  if (!environment || !paypalApiOrigin(environment)) return false;
  return validCredential(env?.PAYPAL_CLIENT_ID) && validCredential(env?.PAYPAL_CLIENT_SECRET);
}

export async function createPaypalOrder({ env, amountMinor, currencyCode = PAYPAL_CURRENCY, referenceId, requestId, returnUrl, cancelUrl, fetchImplementation = fetch }) {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: requireReference(referenceId, 64),
      // Exact integer minor units formatted without floating-point arithmetic.
      amount: { currency_code: currencyCode, value: minorUnitsToDecimalString(amountMinor) },
    }],
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'PAY_NOW',
          return_url: requireHttps(returnUrl),
          cancel_url: requireHttps(cancelUrl),
        },
      },
    },
  };
  const payload = await paypalRequest({ env, path: '/v2/checkout/orders', method: 'POST', requestId, body, fetchImplementation, prefer: 'return=minimal' });
  return { id: String(payload?.id || ''), links: Array.isArray(payload?.links) ? payload.links : [] };
}

export async function getPaypalOrder({ env, orderId, fetchImplementation = fetch }) {
  return paypalRequest({ env, path: `/v2/checkout/orders/${requirePaypalId(orderId)}`, method: 'GET', fetchImplementation });
}

export async function capturePaypalOrder({ env, orderId, requestId, fetchImplementation = fetch }) {
  return paypalRequest({ env, path: `/v2/checkout/orders/${requirePaypalId(orderId)}/capture`, method: 'POST', requestId, body: {}, fetchImplementation });
}

export async function getPaypalCapture({ env, captureId, fetchImplementation = fetch }) {
  return paypalRequest({ env, path: `/v2/payments/captures/${requirePaypalId(captureId)}`, method: 'GET', fetchImplementation });
}

export async function getPaypalRefund({ env, refundId, fetchImplementation = fetch }) {
  return paypalRequest({ env, path: `/v2/payments/refunds/${requirePaypalId(refundId)}`, method: 'GET', fetchImplementation });
}

// Remote verification (the documented verify-webhook-signature API) is the
// preferred mechanism: PureLink never downloads or trusts certificate URLs
// from inbound requests, and PayPal performs the cryptographic check.
export async function verifyPaypalWebhookSignature({ env, webhookEvent, transmission, fetchImplementation = fetch }) {
  const body = {
    auth_algo: String(transmission?.authAlgo || ''),
    cert_url: String(transmission?.certUrl || ''),
    transmission_id: String(transmission?.transmissionId || ''),
    transmission_sig: String(transmission?.transmissionSig || ''),
    transmission_time: String(transmission?.transmissionTime || ''),
    webhook_id: String(env?.PAYPAL_WEBHOOK_ID || ''),
    webhook_event: webhookEvent,
  };
  let payload;
  try {
    payload = await paypalRequest({ env, path: '/v1/notifications/verify-webhook-signature', method: 'POST', body, fetchImplementation });
  } catch (error) {
    // Fail closed: an unverifiable event is never processed. The caller logs
    // only the sanitized issue.
    throw new PayPalApiError({ status: error instanceof PayPalApiError ? error.status : null, issue: error instanceof PayPalApiError ? error.issue : 'verification request failed' });
  }
  return payload?.verification_status === 'SUCCESS';
}

// Extracts and validates the buyer approval link from an order response. The
// href is never trusted as returned: it must match the environment's allowlisted
// checkout origin, use HTTPS, and carry this exact order id as its token.
export function paypalApproveUrl(order, environment) {
  const links = Array.isArray(order?.links) ? order.links : [];
  const link = links.find((item) => ['payer-action', 'approve'].includes(String(item?.rel || '')) && String(item?.href || ''));
  const href = String(link?.href || '');
  if (!href) return '';
  try {
    const url = new URL(href);
    const token = url.searchParams.get('token');
    if (url.origin !== PAYPAL_CHECKOUT_ORIGINS[environment] || url.protocol !== 'https:' || token !== String(order?.id || '')) return '';
    // Rebuild from validated parts so no unexpected query parameters survive.
    return `${PAYPAL_CHECKOUT_ORIGINS[environment]}/checkoutnow?token=${encodeURIComponent(token)}`;
  } catch {
    return '';
  }
}

export function minorUnitsToDecimalString(amountMinor) {
  // Strict: callers pass exact integer minor units; fractional or non-numeric
  // input is a programming error and must never be silently truncated.
  const minor = Number(amountMinor);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new PaymentError('supportAmountInvalid', 400);
  const major = Math.floor(minor / 100);
  const cents = minor - major * 100;
  return `${major}.${String(cents).padStart(2, '0')}`;
}

// Internal authenticated request. One attempt per call; a single refresh is
// attempted only when PayPal rejects the cached token as invalid.
async function paypalRequest({ env, path, method, requestId, body, fetchImplementation, prefer }) {
  const environment = paypalEnvironment(env);
  const origin = paypalApiOrigin(environment);
  if (!origin || !validCredential(env?.PAYPAL_CLIENT_ID) || !validCredential(env?.PAYPAL_CLIENT_SECRET)) {
    throw new PayPalApiError({ status: null, issue: 'PayPal is not configured' });
  }
  const token = await getPaypalAccessToken({ env, fetchImplementation });
  let response;
  try {
    response = await fetchImplementation(`${origin}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(requestId ? { 'paypal-request-id': requestId } : {}),
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new PayPalApiError({ status: null, issue: 'PayPal API request timed out' });
    throw new PayPalApiError({ status: null, issue: 'PayPal API request failed' });
  }
  if (response.status === 401) {
    // One bounded refresh for a token that expired in cache, then stop.
    const refreshed = await getPaypalAccessToken({ env, fetchImplementation, forceRefresh: true });
    try {
      response = await fetchImplementation(`${origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${refreshed}`,
          'content-type': 'application/json',
          ...(requestId ? { 'paypal-request-id': requestId } : {}),
          ...(prefer ? { prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new PayPalApiError({ status: null, issue: 'PayPal API request timed out' });
      throw new PayPalApiError({ status: null, issue: 'PayPal API request failed' });
    }
  }
  let payload = null;
  if (response.status !== 204) {
    const raw = await response.text().catch(() => '');
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }
  }
  if (!response.ok) {
    throw new PayPalApiError({
      status: response.status,
      issue: sanitizeIssue(payload?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`),
    });
  }
  return payload;
}

async function getPaypalAccessToken({ env, fetchImplementation, forceRefresh = false }) {
  const environment = paypalEnvironment(env);
  const cacheKey = `${environment}:${env.PAYPAL_CLIENT_ID}`;
  if (!forceRefresh) {
    const cached = accessTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
  }
  const origin = paypalApiOrigin(environment);
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  let response;
  try {
    response = await fetchImplementation(`${origin}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MILLISECONDS),
    });
  } catch {
    throw new PayPalApiError({ status: null, issue: 'PayPal token request failed' });
  }
  let payload = null;
  const raw = await response.text().catch(() => '');
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = null; }
  }
  if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
    throw new PayPalApiError({ status: response.status, issue: sanitizeIssue(payload?.error || `HTTP ${response.status}`) });
  }
  const expiresInSeconds = Math.max(0, Math.trunc(Number(payload.expires_in) || 0));
  accessTokenCache.set(cacheKey, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(0, (expiresInSeconds - TOKEN_EXPIRY_SAFETY_SECONDS) * 1000),
  });
  return payload.access_token;
}

function sanitizeIssue(issue) {
  const text = String(issue ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 200) || 'unspecified PayPal API error';
}

function validCredential(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= MAX_CLIENT_ID_LENGTH;
}

function requireReference(value, maxLength) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(text) || text.length > maxLength) throw new PayPalApiError({ status: null, issue: 'invalid reference id' });
  return text;
}

function requireHttps(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') throw new Error('not https');
    return url.toString();
  } catch {
    throw new PayPalApiError({ status: null, issue: 'invalid https callback url' });
  }
}

// PayPal resource ids are alphanumeric with dashes/underscores (17-25 chars in
// practice); keep validation strict and bounded.
function requirePaypalId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9-]{5,64}$/.test(id)) throw new PayPalApiError({ status: null, issue: 'invalid PayPal resource id' });
  return encodeURIComponent(id);
}
