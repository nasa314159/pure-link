// PayPal one-time voluntary support (Orders v2, hosted approval redirect).
//
// This rail is deliberately independent of AI credits: no user ID, pack ID, or
// credit count exists anywhere on it, so no PayPal event can reach a credit
// path. It is also independent of ECPay, Lemon Squeezy, and Ko-fi, which keep
// their own tables, callbacks, and totals.
//
// Money handling: all amounts are exact integer minor units (US cents) parsed
// with string arithmetic. Floating-point arithmetic never touches a stored or
// compared amount. Currency is pinned to USD at every boundary.
//
// Verification invariants (all entry points converge on processVerifiedCapture):
// - The browser return from PayPal is informational only. Nothing is read from
//   the browser beyond the order id used for lookup, and the order is always
//   re-fetched and re-verified server-side against the local checkout row
//   (identity, recipient merchant, exact amount, exact currency) before a
//   contribution is recorded.
// - Webhook events are verified with PayPal's remote verify-webhook-signature
//   API before they are recorded or acted on. Unverified events are refused
//   and never retained.
// - Capture idempotency rests on two layers: a stable per-checkout
//   PayPal-Request-Id (PayPal returns the same capture for a repeated
//   request-id, verified in Sandbox milestone M0) and database uniqueness
//   constraints (INSERT OR IGNORE on capture/order/checkout identities).
//
// Webhook event names confirmed against the official event-names reference
// (developer.paypal.com/api/rest/webhooks/event-names, 2026-11):
// CHECKOUT.ORDER.APPROVED, CHECKOUT.ORDER.COMPLETED, PAYMENT.CAPTURE.COMPLETED,
// PAYMENT.CAPTURE.PENDING, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.DECLINED,
// PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED, PAYMENT.REFUND.PENDING,
// PAYMENT.REFUND.FAILED, CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED.

import {
  PAYPAL_CURRENCY,
  capturePaypalOrder,
  createPaypalOrder,
  getPaypalCapture,
  getPaypalOrder,
  getPaypalRefund,
  isPaypalClientConfigured,
  paypalApproveUrl,
  paypalEnvironment,
  verifyPaypalWebhookSignature,
} from './paypal-client.js';
import { json, redirect } from './http.js';
import { PaymentError } from './payment-error.js';
import { normalizePublicAttribution } from './ecpay-support.js';

// Provisional product defaults (explicit decision, see the M1A report):
// presets $5/$10/$20/$30, custom range $3.00–$300.00, all in exact minor units.
export const PAYPAL_SUPPORT_PRESET_AMOUNTS_MINOR = Object.freeze([500, 1000, 2000, 3000]);
export const PAYPAL_SUPPORT_MIN_AMOUNT_MINOR = 300;
export const PAYPAL_SUPPORT_MAX_AMOUNT_MINOR = 30000;

const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;
// Captures initiated by PayPal can stay PENDING (e.g. eCheck); the checkout row
// keeps that state instead of guessing.
const CAPTURE_REQUEST_ID_PREFIX = 'cap-';
// An unmatched local checkout older than this is marked expired by the
// operator reconciliation (records are retained, never deleted).
const CHECKOUT_EXPIRY_DAYS = 30;

export function parsePaypalSupportAmount(value) {
  // Strict like the ECPay rail: no whitespace tolerance, ASCII digits only,
  // at most two decimals, exact integer minor-unit result.
  const source = String(value ?? '');
  if (!/^[0-9]{1,3}(?:\.[0-9]{1,2})?$/.test(source)) return null;
  const [majorText, fractionText = ''] = source.split('.');
  const minor = Number(majorText) * 100 + Number(`${fractionText}00`.slice(0, 2));
  if (!Number.isSafeInteger(minor)) return null;
  return minor >= PAYPAL_SUPPORT_MIN_AMOUNT_MINOR && minor <= PAYPAL_SUPPORT_MAX_AMOUNT_MINOR ? minor : null;
}

export function isPaypalMerchantIdConfigured(env) {
  return /^[A-Za-z0-9]{3,64}$/.test(String(env?.PAYPAL_MERCHANT_ID || '').trim());
}

export function isPaypalSupportCheckoutConfigured(env) {
  // Fail-closed gate for NEW checkouts only. Refund, reversal, capture, and
  // reconciliation processing of already-created checkouts never requires this
  // flag, so disabling new checkout cannot strand valid existing payments.
  // Mirroring the ECPay rail, the Live environment is additionally bound to the
  // canonical public origin so live payment rails cannot quietly run elsewhere.
  return isPaypalClientConfigured(env)
    && isPaypalMerchantIdConfigured(env)
    && String(env?.PAYPAL_SUPPORT_CHECKOUT_ENABLED || '') === 'true'
    && (paypalEnvironment(env) !== 'production' || paypalConfiguredOrigin(env) === 'https://no-no.uk');
}

export function isPaypalWebhookConfigured(env) {
  return isPaypalClientConfigured(env)
    && isPaypalMerchantIdConfigured(env)
    && String(env?.PAYPAL_WEBHOOK_ID || '').length >= 16;
}

// Creates a local checkout row and a server-side PayPal order, then returns the
// allowlisted approval URL. No third-party script is involved; the supporter
// sees the exact USD amount on the PureLink form before redirecting.
export async function createPaypalSupportCheckout({ requestUrl, locale, input, env, fetchImplementation = fetch }) {
  if (!isPaypalSupportCheckoutConfigured(env)) throw new PaymentError('supportUnavailable');
  const amountMinor = parsePaypalSupportAmount(input?.amount);
  if (amountMinor == null) throw new PaymentError('supportAmountInvalid', 400);
  const attribution = normalizePublicAttribution(input);
  const id = crypto.randomUUID();
  // The durable create-order idempotency key is stored on the row AND sent as
  // the PayPal-Request-Id, so a retry of the same checkout reuses one key.
  const requestId = createPaypalRequestId(id, 'cre-');
  const merchantId = String(env.PAYPAL_MERCHANT_ID).trim();
  await env.pure_link_db.prepare(`
    INSERT INTO paypal_support_checkouts (
      id, paypal_request_id, expected_amount_minor, expected_currency, merchant_id,
      public_name, public_message, public_amount, public_display_name, public_message_text
    ) VALUES (?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, requestId, amountMinor, merchantId, attribution.publicName, attribution.publicMessage,
    attribution.publicAmount, attribution.displayName, attribution.message,
  ).run();

  try {
    const origin = paypalPublicOrigin(requestUrl, env);
    const resultLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
    const order = await createOrderWithRetryIds({ env, amountMinor, id, origin, resultLocale, fetchImplementation });
    const approveUrl = paypalApproveUrl(order, paypalEnvironment(env));
    if (!order.id || !approveUrl) throw new PaymentError('billingProviderFailed', 502);
    const update = await env.pure_link_db.prepare(`
      UPDATE paypal_support_checkouts SET paypal_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(String(order.id), id).run();
    if (changes(update) !== 1) throw new PaymentError('billingProviderFailed', 502);
    return { provider: 'paypal', checkoutUrl: approveUrl };
  } catch (error) {
    await markCheckout(env.pure_link_db, id, 'failed');
    throw error;
  }
}

// PayPal order creation is attempted exactly once per local checkout row. A
// local UNIQUE collision on paypal_order_id (a PayPal id already attached to
// another checkout) fails the attempt and leaves the row failed.
async function createOrderWithRetryIds({ env, amountMinor, id, origin, resultLocale, fetchImplementation }) {
  return createPaypalOrder({
    env,
    amountMinor,
    currencyCode: PAYPAL_CURRENCY,
    referenceId: referenceForPaypal(id),
    requestId: createPaypalRequestId(id, 'cre-'),
    returnUrl: `${origin}/api/payment-return/paypal-support?locale=${resultLocale}`,
    cancelUrl: `${origin}/${resultLocale}/support`,
    fetchImplementation,
  });
}

// Browser return from PayPal (GET with ?token=<order id>&PayerID=...). This is
// deliberately non-authoritative: only the token is read, and the order is
// re-verified server-side before anything is recorded. The result is a
// same-origin redirect; no payment state is ever exposed to the browser.
export async function handlePaypalSupportBrowserReturn(requestUrl, env, fetchImplementation = fetch) {
  const locale = requestUrl.searchParams.get('locale') === 'zh-Hant' ? 'zh-Hant' : 'en';
  const pendingRedirect = () => redirect(`/${locale}/support?support=pending`, 303);
  if (!isPaypalClientConfigured(env)) return pendingRedirect();
  const orderId = validPaypalResourceId(requestUrl.searchParams.get('token'));
  if (!orderId || !env.pure_link_db) return pendingRedirect();
  try {
    const result = await processVerifiedCapture({ env, db: env.pure_link_db, orderId, fetchImplementation });
    if (result.outcome === 'completed') return redirect(`/${locale}/support?thanks=1`, 303);
  } catch (error) {
    console.error('PayPal support browser return processing failed', { name: error?.name, message: error?.message });
  }
  return pendingRedirect();
}

// Dedicated PayPal webhook endpoint. Flow: verify remotely → durably record →
// process → mark processed. A 2xx is returned only after accounting committed
// (or for an exact replay/unsupported-event ack); failures return 5xx so
// PayPal retries while the recorded event row enables durable recovery.
export async function handlePaypalWebhook(request, env, fetchImplementation = fetch) {
  if (!isPaypalWebhookConfigured(env)) return json({ error: 'Webhook is not configured.' }, { status: 503 });
  const contentType = String(request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (contentType !== 'application/json') return json({ error: 'Invalid webhook payload.' }, { status: 400 });
  const rawBody = await readBoundedText(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody == null) return json({ error: 'Webhook payload is too large.' }, { status: 413 });
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: 'Invalid webhook payload.' }, { status: 400 }); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'Invalid webhook payload.' }, { status: 400 });
  const eventId = validEventId(payload.id);
  const eventType = typeof payload.event_type === 'string' && payload.event_type.length <= 100 ? payload.event_type : '';
  if (!eventId || !eventType) return json({ error: 'Invalid webhook payload.' }, { status: 400 });

  // Event authenticity is confirmed before anything is trusted or stored.
  let verified;
  try {
    verified = await verifyPaypalWebhookSignature({
      env,
      webhookEvent: payload,
      transmission: {
        authAlgo: request.headers.get('paypal-auth-algo'),
        certUrl: request.headers.get('paypal-cert-url'),
        transmissionId: request.headers.get('paypal-transmission-id'),
        transmissionSig: request.headers.get('paypal-transmission-sig'),
        transmissionTime: request.headers.get('paypal-transmission-time'),
      },
      fetchImplementation,
    });
  } catch (error) {
    console.error('PayPal webhook verification request failed', { issue: error?.issue });
    // Unverifiable right now: refuse without recording; PayPal will retry.
    return json({ error: 'Webhook verification is unavailable.' }, { status: 503 });
  }
  if (!verified) return json({ error: 'Invalid webhook signature.' }, { status: 401 });

  const db = env.pure_link_db;
  // Minimal resource identifiers only (no payload, no personal data) so a
  // processing failure remains recoverable through PayPal's authenticated
  // lookup APIs without retaining the original event body.
  const identifiers = extractEventIdentifiers(eventType, payload.resource);
  await recordWebhookEvent(db, eventId, eventType, identifiers);
  const event = await db.prepare('SELECT state FROM paypal_support_webhook_events WHERE event_id = ?').bind(eventId).first();
  // Exact replay of an already-committed event: acknowledge identically.
  if (event?.state === 'processed') return json({ received: true });

  await db.prepare(`
    UPDATE paypal_support_webhook_events SET state = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
  `).bind(eventId).run();
  try {
    const note = await processWebhookEvent({ env, db, eventType, resource: payload.resource, fetchImplementation });
    await db.prepare(`
      UPDATE paypal_support_webhook_events SET state = 'processed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
    `).bind(note ? sanitizeNote(note) : null, eventId).run();
    return json({ received: true });
  } catch (error) {
    // Financial processing did not commit: the event stays durably recorded as
    // failed for operator recovery, and PayPal receives a retryable 5xx.
    await db.prepare(`
      UPDATE paypal_support_webhook_events SET state = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
    `).bind(sanitizeNote(error?.message || 'processing failed'), eventId).run();
    console.error('PayPal webhook processing failed', { eventId, name: error?.name, message: error?.message });
    return json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

// Single dispatch table for verified events. Everything financial converges on
// processVerifiedCapture / applyVerifiedRefund; unsupported event types are
// acknowledged and retained without action.
async function processWebhookEvent({ env, db, eventType, resource, fetchImplementation }) {
  const source = resource && typeof resource === 'object' && !Array.isArray(resource) ? resource : {};
  switch (eventType) {
    case 'CHECKOUT.ORDER.APPROVED':
    case 'CHECKOUT.ORDER.COMPLETED': {
      const orderId = validPaypalResourceId(source.id);
      if (!orderId) return 'ignored: missing order id';
      return (await processVerifiedCapture({ env, db, orderId, fetchImplementation })).outcome;
    }
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const capture = parseCaptureEventResource(source);
      if (!capture) return 'ignored: unreadable capture event';
      return (await processVerifiedCapture({ env, db, orderId: capture.orderId, captureIdHint: capture.captureId, fetchImplementation })).outcome;
    }
    case 'PAYMENT.CAPTURE.PENDING': {
      const capture = parseCaptureEventResource(source);
      if (capture?.orderId) await markCheckoutByOrderId(db, capture.orderId, 'capture_pending');
      return capture ? 'capture pending recorded' : 'ignored: unreadable capture event';
    }
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      const capture = parseCaptureEventResource(source);
      if (capture?.orderId) await markCheckoutFailedByOrderId(db, capture.orderId);
      return capture ? 'capture failure recorded' : 'ignored: unreadable capture event';
    }
    case 'PAYMENT.CAPTURE.REFUNDED': {
      const refund = parseRefundEventResource(source);
      if (!refund) return 'ignored: unreadable refund event';
      return (await applyVerifiedRefund({ db, captureId: refund.captureId, kind: 'refund', refundId: refund.refundId, amountMinor: refund.amountMinor })).outcome;
    }    case 'PAYMENT.CAPTURE.REVERSED': {
      const capture = parseCaptureEventResource(source);
      if (!capture || capture.status !== 'REVERSED') return 'ignored: unreadable reversal event';
      return (await applyVerifiedRefund({ db, captureId: capture.captureId, kind: 'reversal', refundId: null, amountMinor: capture.amountMinor })).outcome;
    }
    case 'PAYMENT.REFUND.PENDING':
    case 'PAYMENT.REFUND.FAILED':
      // Refund lifecycle recognition only: merchant refunds are recorded from
      // PAYMENT.CAPTURE.REFUNDED, which is the completed-refund statement.
      return 'refund lifecycle event recorded';
    case 'CUSTOMER.DISPUTE.CREATED':
    case 'CUSTOMER.DISPUTE.UPDATED': {
      const captureIds = parseDisputeCaptureIds(source);
      for (const captureId of captureIds) await markContributionDisputed(db, captureId);
      return captureIds.length ? 'dispute open recorded' : 'dispute event recorded without matching capture';
    }
    case 'CUSTOMER.DISPUTE.RESOLVED': {
      const resolvedCaptureIds = parseDisputeCaptureIds(source);
      for (const captureId of resolvedCaptureIds) await markContributionDisputeResolved(db, captureId);
      // Money state stays ledger-derived; the resolution is provider-evidenced
      // by the PayPal-signed dispute event.
      return resolvedCaptureIds.length ? 'dispute resolution recorded' : 'dispute resolution recorded without matching capture';
    }
    default:
      // Unknown or future event types are safely acknowledged, never acted on.
      return 'unsupported event ignored';
  }
}

// ─── Converged capture verification and accounting ───────────────────────────

// The single idempotent path used by the browser return, approval/completed
// order webhooks, capture webhooks, and operator reconciliation. Parallel
// callers are safe: the capture uses one stable per-checkout PayPal-Request-Id
// (PayPal returns the same capture), and the contribution insert is
// INSERT OR IGNORE on unique capture/order/checkout identities.
async function processVerifiedCapture({ env, db, orderId, captureIdHint = '', fetchImplementation = fetch }) {
  // A capture event may repeat after the contribution is already recorded; the
  // capture identity is the dedupe anchor for that replay. Also converges a
  // checkout that a crash left unmarked after the contribution committed.
  if (captureIdHint) {
    const existing = await db.prepare(`
      SELECT contribution.checkout_request_id, checkout.paypal_order_id, checkout.status
      FROM paypal_support_contributions contribution
      JOIN paypal_support_checkouts checkout ON checkout.id = contribution.checkout_request_id
      WHERE contribution.paypal_capture_id = ?
    `).bind(captureIdHint).first();
    if (existing) {
      if (existing.status !== 'completed') await markCheckout(db, existing.checkout_request_id, 'completed');
      return { outcome: 'completed', captureId: captureIdHint };
    }
  }
  const checkout = await db.prepare(`
    SELECT id, paypal_order_id, expected_amount_minor, merchant_id, public_name,
      public_message, public_amount, public_display_name, public_message_text, status
    FROM paypal_support_checkouts WHERE paypal_order_id = ?
  `).bind(orderId).first();
  if (!checkout) {
    // A capture event for an unknown local checkout is acknowledged but never
    // recorded as support money.
    return { outcome: 'unknown-checkout' };
  }
  if (checkout.status === 'completed') return { outcome: 'completed' };
  // failed/expired are LOCAL bookkeeping states (a previous declined attempt or
  // an abandoned-checkout sweep). They never outrank authoritative financial
  // settlement: a verified completed capture that matches this checkout's
  // recorded identity, amount, currency, and merchant is still recorded below.
  // Only the full verification in this function may decide what money happened.

  // Server-side lookup: the order's identity, recipient merchant, amount, and
  // currency must all match the local expectation exactly.
  const order = await getPaypalOrder({ env, orderId: checkout.paypal_order_id, fetchImplementation });
  const orderCheck = verifyOrderAgainstCheckout(order, checkout);
  if (orderCheck.outcome === 'not-approved') return { outcome: 'not-approved' };
  if (orderCheck.outcome === 'voided') {
    await markCheckout(db, checkout.id, 'failed');
    return { outcome: 'voided' };
  }
  if (orderCheck.outcome === 'mismatch') {
    // Bounded operator diagnostic: the mismatch category and the PayPal-returned
    // recipient identifier (our own merchant identity, never a payer value).
    console.error('PayPal support verification mismatch', {
      kind: 'order', orderId: checkout.paypal_order_id, reason: orderCheck.reason,
      payeeMerchantId: orderCheck.payeeMerchantId || null, expectedMerchantId: checkout.merchant_id,
      expectedAmountMinor: checkout.expected_amount_minor, paypalAmountValue: orderCheck.amountValue || null,
    });
    return { outcome: 'mismatch' };
  }

  // Capture only when the buyer has approved. On an already-COMPLETED order the
  // capture identity comes from the order itself.
  let capture = orderCheck.status === 'COMPLETED' ? extractCaptureFromOrder(order) : null;
  if (!capture) {
    const captureResponse = await capturePaypalOrder({
      env, orderId: checkout.paypal_order_id, requestId: createPaypalRequestId(checkout.id, CAPTURE_REQUEST_ID_PREFIX), fetchImplementation,
    });
    capture = extractCaptureFromOrder(captureResponse);
    if (!capture && captureIdHint) capture = await lookupCapture({ env, captureIdHint, fetchImplementation });
    // Minimal-vs-representation gap: re-fetch the full order representation.
    if (!capture) {
      const refreshed = await getPaypalOrder({ env, orderId: checkout.paypal_order_id, fetchImplementation });
      capture = extractCaptureFromOrder(refreshed);
    }
  }
  if (!capture) {
    // Uncertain outcome: never guess. The checkout stays capture_pending so the
    // operator reconciliation re-queries PayPal before any retry.
    await markCheckout(db, checkout.id, 'capture_pending');
    return { outcome: 'uncertain' };
  }

  const captureCheck = verifyCaptureAgainstCheckout(capture, checkout);
  if (captureCheck.outcome === 'pending') {
    await markCheckout(db, checkout.id, 'capture_pending');
    return { outcome: 'capture-pending' };
  }
  if (captureCheck.outcome === 'declined') {
    await markCheckout(db, checkout.id, 'failed');
    return { outcome: 'declined' };
  }
  if (captureCheck.outcome === 'mismatch') {
    console.error('PayPal support verification mismatch', {
      kind: 'capture', captureId: capture.captureId, reason: captureCheck.reason,
      payeeMerchantId: capture.payee?.merchant_id || null, expectedMerchantId: checkout.merchant_id,
      expectedAmountMinor: checkout.expected_amount_minor, paypalAmountValue: captureCheck.amountValue || null,
    });
    return { outcome: 'mismatch' };
  }

  await recordContribution(db, checkout, capture);
  await markCheckout(db, checkout.id, 'completed');
  await refreshContributionRefundState(db, capture.captureId);
  return { outcome: 'completed', captureId: capture.captureId };
}

function verifyOrderAgainstCheckout(order, checkout) {
  const status = String(order?.status || '');
  if (status === 'VOIDED') return { outcome: 'voided' };
  if (!['APPROVED', 'COMPLETED'].includes(status)) return { outcome: 'not-approved' };
  const units = Array.isArray(order?.purchase_units) ? order.purchase_units : [];
  if (units.length !== 1) return { outcome: 'mismatch', reason: 'purchase-units' };
  const unit = units[0];
  const amount = unit?.amount || {};
  if (String(amount.currency_code || '') !== PAYPAL_CURRENCY) return { outcome: 'mismatch', reason: 'currency', amountValue: amount.value };
  if (parseMinorUnits(amount.value) !== Number(checkout.expected_amount_minor)) return { outcome: 'mismatch', reason: 'amount', amountValue: amount.value };
  const payeeMerchantId = validPaypalResourceId(unit?.payee?.merchant_id);
  if (payeeMerchantId !== String(checkout.merchant_id)) return { outcome: 'mismatch', reason: 'merchant', payeeMerchantId, amountValue: amount.value };
  return { outcome: 'ok', status };
}

function verifyCaptureAgainstCheckout(capture, checkout) {
  const status = String(capture.status || '');
  if (status === 'PENDING') return { outcome: 'pending' };
  if (['DECLINED', 'FAILED', 'DENIED'].includes(status)) return { outcome: 'declined' };
  if (status !== 'COMPLETED') return { outcome: 'mismatch', reason: 'status' };
  if (parseMinorUnits(capture.amount?.value) !== Number(checkout.expected_amount_minor)) return { outcome: 'mismatch', reason: 'amount', amountValue: capture.amount?.value };
  if (String(capture.amount?.currency_code || '') !== PAYPAL_CURRENCY) return { outcome: 'mismatch', reason: 'currency', amountValue: capture.amount?.value };
  const payeeMerchantId = validPaypalResourceId(capture.payee?.merchant_id);
  if (payeeMerchantId !== String(checkout.merchant_id)) return { outcome: 'mismatch', reason: 'merchant', payeeMerchantId, amountValue: capture.amount?.value };
  // A support capture is final; a non-final capture would imply a multi-capture
  // contract this rail does not use.
  if (capture.final_capture === false) return { outcome: 'mismatch', reason: 'not-final' };
  return { outcome: 'ok' };
}

async function lookupCapture({ env, captureIdHint, fetchImplementation }) {
  if (!captureIdHint) return null;
  try {
    const capture = await getPaypalCapture({ env, captureId: captureIdHint, fetchImplementation });
    return capture ? normalizeCaptureResource(capture) : null;
  } catch {
    return null;
  }
}

function extractCaptureFromOrder(order) {
  const units = Array.isArray(order?.purchase_units) ? order.purchase_units : [];
  const captures = Array.isArray(units[0]?.payments?.captures) ? units[0].payments.captures : [];
  for (const raw of captures) {
    const capture = normalizeCaptureResource(raw);
    if (capture) return capture;
  }
  return null;
}

function normalizeCaptureResource(raw) {
  const captureId = validPaypalResourceId(raw?.id);
  if (!captureId) return null;
  return {
    captureId,
    status: String(raw?.status || ''),
    amount: {
      value: String(raw?.amount?.value || ''),
      currency_code: String(raw?.amount?.currency_code || ''),
    },
    payee: { merchant_id: validPaypalResourceId(raw?.payee?.merchant_id) || '' },
    final_capture: raw?.final_capture === undefined ? undefined : raw.final_capture === true,
  };
}

async function recordContribution(db, checkout, capture) {
  const result = await db.prepare(`
    INSERT OR IGNORE INTO paypal_support_contributions (
      paypal_capture_id, paypal_order_id, checkout_request_id, merchant_id,
      amount_minor, currency, status, refunded_amount_minor,
      public_name, public_message, public_amount, public_display_name, public_message_text
    ) VALUES (?, ?, ?, ?, ?, 'USD', 'completed', 0, ?, ?, ?, ?, ?)
  `).bind(
    capture.captureId, checkout.paypal_order_id, checkout.id, String(checkout.merchant_id),
    Number(checkout.expected_amount_minor),
    Number(checkout.public_name), Number(checkout.public_message), Number(checkout.public_amount),
    checkout.public_display_name || null, checkout.public_message_text || null,
  ).run();
  // changes() === 0 means a parallel entry point already recorded this exact
  // capture; the unique constraints guarantee the stored row is identical.
  return changes(result);
}

// ─── Refunds and reversals ───────────────────────────────────────────────────

// Records a verified merchant refund or PayPal reversal and folds it into the
// contribution's ledger-derived state. Safe for duplicates (UNIQUE operation
// key), out-of-order delivery (rows may precede the capture record), and late
// events (state is recomputed from the ledger, never incremented blindly).
async function applyVerifiedRefund({ db, captureId, kind, refundId, amountMinor }) {
  const contribution = await db.prepare(`
    SELECT paypal_capture_id, amount_minor FROM paypal_support_contributions WHERE paypal_capture_id = ?
  `).bind(captureId).first();
  if (amountMinor == null || amountMinor <= 0) return { outcome: 'ignored: unreadable refund amount' };
  const requestId = kind === 'refund' ? `refund:${refundId}` : `reversal:${captureId}`;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO paypal_support_refunds (
      id, paypal_capture_id, paypal_refund_id, paypal_request_id, kind, amount_minor, currency, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'USD', 'completed')
  `).bind(crypto.randomUUID(), captureId, kind === 'refund' ? refundId : null, requestId, kind, amountMinor);
  let result;
  try {
    result = await insert.run();
  } catch (error) {
    if (/exceeds contribution amount/i.test(String(error?.message))) {
      // Verified-but-impossible accounting: refuse the row, acknowledge the
      // event, and surface it through the event note for operator review.
      return { outcome: 'excess-refund-rejected' };
    }
    throw error;
  }
  if (changes(result) === 0) return { outcome: 'duplicate-refund' };
  if (contribution) await refreshContributionRefundState(db, captureId);
  return { outcome: contribution ? 'refund-applied' : 'refund-recorded-awaiting-capture' };
}

// Recomputes the contribution's refund state from the append-only ledger.
// Deterministic in any delivery order, so late or duplicated events converge.
async function refreshContributionRefundState(db, captureId) {
  const contribution = await db.prepare(`
    SELECT amount_minor FROM paypal_support_contributions WHERE paypal_capture_id = ?
  `).bind(captureId).first();
  if (!contribution) return;
  const ledger = await db.prepare(`
    SELECT kind, COALESCE(SUM(amount_minor), 0) AS total_minor FROM paypal_support_refunds
    WHERE paypal_capture_id = ? AND status = 'completed' GROUP BY kind
  `).bind(captureId).all();
  const totals = Object.fromEntries((ledger?.results || []).map((row) => [String(row.kind), Number(row.total_minor) || 0]));
  const amount = Number(contribution.amount_minor);
  const refunded = Math.min(amount, (totals.refund || 0) + (totals.reversal || 0));
  const status = (totals.reversal || 0) > 0
    ? 'reversed'
    : refunded >= amount ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'completed';
  await db.prepare(`
    UPDATE paypal_support_contributions
    SET refunded_amount_minor = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE paypal_capture_id = ?
  `).bind(refunded, status, captureId).run();
}

async function markContributionDisputed(db, captureId) {
  // Dispute lifecycle is tracked separately from the ledger-derived refund
  // status: refund accounting can never silently clear an unresolved dispute.
  await db.prepare(`
    UPDATE paypal_support_contributions SET dispute_state = 'open', updated_at = CURRENT_TIMESTAMP
    WHERE paypal_capture_id = ? AND status != 'capture_pending'
  `).bind(captureId).run();
}

async function markContributionDisputeResolved(db, captureId) {
  // Provider evidence: the PayPal-signed dispute event carrying the dispute
  // lifecycle for this capture; only an open dispute is transitioned.
  await db.prepare(`
    UPDATE paypal_support_contributions SET dispute_state = 'resolved', updated_at = CURRENT_TIMESTAMP
    WHERE paypal_capture_id = ? AND dispute_state = 'open'
  `).bind(captureId).run();
}

// ─── Operator reconciliation (minimal manual mechanism for this milestone) ───

// Bounded, secret-gated operator entry point. Covers missing browser returns,
// missing webhooks, pending captures, failed database writes, recoverable
// failed webhook events, and expired local checkouts. It processes a small
// batch per call and never requires the checkout-enabled flag: reconciliation
// of existing money keeps working while new checkout is disabled.
//
// Fairness: every examined checkout has its updated_at bumped, so a persistently
// failing row rotates to the back of the oldest-first ordering instead of
// permanently starving later records; the 15-minute staleness filter doubles as
// the retry backoff. No Cron or job framework is involved.
export async function reconcilePaypalSupport({ env, fetchImplementation = fetch, batchSize = 10, now = Date.now() }) {
  if (!isPaypalWebhookConfigured(env)) throw new PaymentError('supportUnavailable', 503);
  const db = env.pure_link_db;
  const batch = Math.max(1, Math.min(25, Math.trunc(Number(batchSize) || 10)));
  const stale = await db.prepare(`
    SELECT id, paypal_order_id, status, created_at FROM paypal_support_checkouts
    WHERE status IN ('pending', 'approved', 'capture_pending')
      AND updated_at <= datetime('now', '-15 minutes')
    ORDER BY updated_at LIMIT ?
  `).bind(batch).all();
  const outcomes = {};
  let expired = 0;
  for (const row of stale?.results || []) {
    const expiryAgeMs = now - Date.parse(`${String(row.created_at).replace(' ', 'T')}Z`);
    if (expiryAgeMs > CHECKOUT_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
      await markCheckout(db, row.id, 'expired');
      expired += 1;
      continue;
    }
    try {
      const result = await processVerifiedCapture({ env, db, orderId: row.paypal_order_id, fetchImplementation });
      outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
    } catch (error) {
      outcomes.error = (outcomes.error || 0) + 1;
      console.error('PayPal support reconciliation failed', { checkout: row.id, message: error?.message });
    }
    // Rotate the examined row regardless of outcome so later records are always
    // reached within bounded batches; the staleness filter spaces out retries.
    await touchCheckout(db, row.id);
  }
  // Durable recovery of failed webhook events: re-derive the financial outcome
  // from the minimal stored identifiers using PayPal's authenticated lookup
  // APIs — no stored payload and no browser return required.
  const failedEvents = await db.prepare(`
    SELECT event_id, event_type, paypal_order_id, paypal_capture_id, paypal_refund_id
    FROM paypal_support_webhook_events WHERE state = 'failed'
    ORDER BY updated_at LIMIT ?
  `).bind(batch).all();
  let recoveredEvents = 0;
  let stillFailedEvents = 0;
  for (const event of failedEvents?.results || []) {
    try {
      const note = await reprocessFailedWebhookEvent({ env, db, event, fetchImplementation });
      await db.prepare(`
        UPDATE paypal_support_webhook_events SET state = 'processed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
      `).bind(sanitizeNote(note), event.event_id).run();
      recoveredEvents += 1;
    } catch (error) {
      await db.prepare(`
        UPDATE paypal_support_webhook_events SET state = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
      `).bind(sanitizeNote(error?.message || 'recovery failed'), event.event_id).run();
      stillFailedEvents += 1;
      console.error('PayPal support event recovery failed', { event: event.event_id, message: error?.message });
    }
  }
  const remainingFailedEvents = await db.prepare(`
    SELECT COUNT(*) AS failed FROM paypal_support_webhook_events WHERE state = 'failed'
  `).bind().first();
  return {
    examined: (stale?.results || []).length,
    outcomes,
    expired,
    recoveredEvents,
    stillFailedEvents,
    failedWebhookEvents: Number(remainingFailedEvents?.failed || 0),
  };
}

// Re-derives one failed event's financial outcome from minimal identifiers plus
// authoritative PayPal state. Dispute lifecycles are re-applied directly from
// the stored capture identity; refund amounts are re-read from PayPal so the
// original event payload is never needed.
async function reprocessFailedWebhookEvent({ env, db, event, fetchImplementation }) {
  const eventType = String(event.event_type || '');
  if (event.paypal_refund_id) {
    const refund = await getPaypalRefund({ env, refundId: event.paypal_refund_id, fetchImplementation });
    const parsed = parseRefundEventResource(refund);
    if (!parsed || parsed.status !== 'COMPLETED') throw new Error('refund not completed yet; retry scheduled');
    return (await applyVerifiedRefund({ db, captureId: parsed.captureId, kind: 'refund', refundId: parsed.refundId, amountMinor: parsed.amountMinor })).outcome;
  }
  if (eventType === 'PAYMENT.CAPTURE.REVERSED' && event.paypal_capture_id) {
    const capture = await getPaypalCapture({ env, captureId: event.paypal_capture_id, fetchImplementation });
    const parsed = parseCaptureEventResource(capture);
    if (!parsed || parsed.status !== 'REVERSED') throw new Error('reversal not confirmed yet; retry scheduled');
    return (await applyVerifiedRefund({ db, captureId: parsed.captureId, kind: 'reversal', refundId: null, amountMinor: parsed.amountMinor })).outcome;
  }
  if (eventType === 'CUSTOMER.DISPUTE.CREATED' || eventType === 'CUSTOMER.DISPUTE.UPDATED') {
    if (event.paypal_capture_id) {
      await markContributionDisputed(db, event.paypal_capture_id);
      return 'dispute open recorded';
    }
    throw new Error('unrecoverable without matching capture; use PayPal dashboard resend');
  }
  if (eventType === 'CUSTOMER.DISPUTE.RESOLVED') {
    if (event.paypal_capture_id) {
      await markContributionDisputeResolved(db, event.paypal_capture_id);
      return 'dispute resolution recorded';
    }
    throw new Error('unrecoverable without matching capture; use PayPal dashboard resend');
  }
  if (event.paypal_order_id || event.paypal_capture_id) {
    return (await processVerifiedCapture({ env, db, orderId: event.paypal_order_id, captureIdHint: event.paypal_capture_id, fetchImplementation })).outcome;
  }
  throw new Error('unrecoverable without resource identifiers; use PayPal dashboard resend');
}

async function touchCheckout(db, id) {
  await db.prepare('UPDATE paypal_support_checkouts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
}

// ─── Public totals (consent-controlled) ──────────────────────────────────────

export async function getPaypalSupportTotals(db) {
  if (!db) return emptyTotals();
  const totals = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN status != 'capture_pending' AND amount_minor > refunded_amount_minor
      THEN amount_minor - refunded_amount_minor ELSE 0 END), 0) AS net_usd_minor,
      COALESCE(SUM(CASE WHEN status != 'capture_pending' AND amount_minor > refunded_amount_minor
      THEN 1 ELSE 0 END), 0) AS contribution_count
    FROM paypal_support_contributions
  `).bind().first();
  const supporters = await db.prepare(`
    SELECT contribution.public_name, contribution.public_message, contribution.public_amount,
      contribution.public_display_name, contribution.public_message_text,
      contribution.amount_minor - contribution.refunded_amount_minor AS net_amount_minor
    FROM paypal_support_contributions contribution
    WHERE contribution.status != 'capture_pending'
      AND contribution.amount_minor > contribution.refunded_amount_minor
      AND (contribution.public_name = 1 OR contribution.public_message = 1 OR contribution.public_amount = 1)
    ORDER BY contribution.created_at DESC LIMIT 24
  `).bind().all();
  return {
    netUsdMinor: Math.max(0, Number(totals?.net_usd_minor || 0)),
    contributionCount: Math.max(0, Number(totals?.contribution_count || 0)),
    publicSupporters: (supporters?.results || []).map((row) => ({
      name: Number(row.public_name) === 1 ? String(row.public_display_name || '') : '',
      message: Number(row.public_message) === 1 ? neutralizeMentions(String(row.public_message_text || '')) : '',
      amountText: Number(row.public_amount) === 1 && Number(row.net_amount_minor) > 0 ? minorToDecimalText(row.net_amount_minor) : '',
      currency: PAYPAL_CURRENCY,
    })),
  };
}

// Display-only integer math: minor units back to an exact two-decimal string
// without floating-point arithmetic.
export function minorToDecimalText(minor) {
  const safe = Math.max(0, Math.trunc(Number(minor) || 0));
  const major = Math.floor(safe / 100);
  const cents = safe - major * 100;
  return `${major}.${String(cents).padStart(2, '0')}`;
}

function emptyTotals() { return { netUsdMinor: 0, contributionCount: 0, publicSupporters: [] }; }

// ─── Event/resource strict parsers ───────────────────────────────────────────

function parseCaptureEventResource(resource) {
  const captureId = validPaypalResourceId(resource?.id);
  if (!captureId) return null;
  const orderId = validPaypalResourceId(resource?.supplementary_data?.related_ids?.order_id);
  return {
    captureId,
    orderId,
    status: String(resource?.status || ''),
    amountMinor: parseMinorUnits(resource?.amount?.value),
    currency: String(resource?.amount?.currency_code || ''),
  };
}

function parseRefundEventResource(resource) {
  const refundId = validPaypalResourceId(resource?.id);
  if (!refundId) return null;
  // The refund resource links its capture with rel="up"
  // (.../v2/payments/captures/<id>); that is the documented capture identity.
  const links = Array.isArray(resource?.links) ? resource.links : [];
  const upHref = String(links.find((link) => String(link?.rel || '') === 'up')?.href || '');
  const captureId = validPaypalResourceId(upHref.match(/\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/)?.[1] || '');
  if (!captureId) return null;
  return {
    refundId,
    captureId,
    status: String(resource?.status || ''),
    amountMinor: parseMinorUnits(resource?.amount?.value),
    currency: String(resource?.amount?.currency_code || ''),
  };
}

function parseDisputeCaptureIds(resource) {
  const transactions = Array.isArray(resource?.disputed_transactions) ? resource.disputed_transactions : [];
  return transactions
    .map((item) => validPaypalResourceId(item?.seller_transaction_id))
    .filter(Boolean);
}

async function recordWebhookEvent(db, eventId, eventType, identifiers = {}) {
  await db.prepare(`
    INSERT OR IGNORE INTO paypal_support_webhook_events (event_id, event_type, state, paypal_order_id, paypal_capture_id, paypal_refund_id)
    VALUES (?, ?, 'verified', ?, ?, ?)
  `).bind(eventId, eventType, identifiers.orderId || null, identifiers.captureId || null, identifiers.refundId || null).run();
}

// Minimal provider identifiers extracted from the verified payload before any
// processing, purely for durable recovery.
function extractEventIdentifiers(eventType, resource) {
  const source = resource && typeof resource === 'object' && !Array.isArray(resource) ? resource : {};
  if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
    return { orderId: validPaypalResourceId(source.id) };
  }
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
    const refund = parseRefundEventResource(source);
    return refund ? { refundId: refund.refundId, captureId: refund.captureId } : {};
  }
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'PAYMENT.CAPTURE.REVERSED'
    || eventType === 'PAYMENT.CAPTURE.PENDING' || eventType === 'PAYMENT.CAPTURE.DENIED'
    || eventType === 'PAYMENT.CAPTURE.DECLINED') {
    const capture = parseCaptureEventResource(source);
    return capture ? { captureId: capture.captureId, orderId: capture.orderId } : {};
  }
  if (eventType === 'CUSTOMER.DISPUTE.CREATED' || eventType === 'CUSTOMER.DISPUTE.UPDATED'
    || eventType === 'CUSTOMER.DISPUTE.RESOLVED') {
    // Dispute events keep the disputed capture identities (first one) for
    // recovery; the dispute lifecycle is provider-evidenced by the signed event.
    const captureId = parseDisputeCaptureIds(source)[0] || '';
    return { captureId };
  }
  return {};
}

async function markCheckout(db, id, status) {
  await db.prepare('UPDATE paypal_support_checkouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, id).run();
}

async function markCheckoutByOrderId(db, orderId, status) {
  await db.prepare(`
    UPDATE paypal_support_checkouts SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE paypal_order_id = ? AND status IN ('pending', 'approved')
  `).bind(status, orderId).run();
}

async function markCheckoutFailedByOrderId(db, orderId) {
  await markCheckoutByOrderId(db, orderId, 'failed');
}

function createPaypalRequestId(checkoutId, prefix) {
  // Deterministic per checkout: retries and parallel callers reuse the same
  // PayPal-Request-Id, and PayPal answers with the same result (M0-verified).
  return `${prefix}${String(checkoutId).replaceAll('-', '')}`.slice(0, 38);
}

function referenceForPaypal(checkoutId) {
  return `pl-sup-${String(checkoutId).slice(0, 13).replaceAll('-', '')}`;
}

function parseMinorUnits(value) {
  const source = String(value ?? '').trim();
  if (!/^[0-9]{1,8}(?:\.[0-9]{1,2})?$/.test(source)) return null;
  const [majorText, fractionText = ''] = source.split('.');
  const minor = Number(majorText) * 100 + Number(`${fractionText}00`.slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

function validPaypalResourceId(value) {
  const source = String(value ?? '');
  return /^[A-Za-z0-9-]{5,64}$/.test(source) ? source : '';
}

function validEventId(value) {
  const source = String(value ?? '');
  return /^[A-Za-z0-9-]{8,128}$/.test(source) ? source : '';
}

function sanitizeNote(note) {
  return String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
}

function neutralizeMentions(value) { return value.replaceAll('@', '@\u200B'); }

function paypalPublicOrigin(requestUrl, env) {
  try {
    const url = new URL(String(env?.PUBLIC_ORIGIN || ''));
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/') return url.origin;
  } catch { /* fall through to request origin */ }
  return requestUrl.origin;
}

function paypalConfiguredOrigin(env) {
  try {
    const url = new URL(String(env?.PUBLIC_ORIGIN || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch {
    return '';
  }
}

async function readBoundedText(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length') || '');
  if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) return null;
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return null;
  return new TextDecoder().decode(buffer);
}

function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }
