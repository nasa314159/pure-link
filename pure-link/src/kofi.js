// Ko-fi voluntary-support donation receipts. Ko-fi lets a supporter pay the
// creator directly; this rail only records the provider-emitted webhook as a
// receipt. It has its own tables, its own token check, and no connection to
// AI-credit checkout requests, orders, balances, or credit-granting triggers:
// a Ko-fi event can never grant credits or infer a PureLink account.
//
// Verification caveat: Ko-fi embeds a shared verification token in the payload
// (verification_token). Unlike ECPay's per-request MAC or Lemon Squeezy's
// body HMAC, it does not cryptographically bind the payload fields, so Ko-fi
// data is treated as bookkeeping evidence, not as a fulfillment instruction.
//
// Monetary-unit convention (fixed two-decimal scale): stored `amount_minor`
// is the displayed amount times 100 in EVERY currency, including zero-decimal
// ones such as JPY — it is NOT the ISO 4217 minor unit (1500 JPY is stored as
// 150000, not 1500). Refund reconciliations record the same fixed scale, and
// the public display divides the stored integer back by 100 and formats it in
// the receipt currency with the currency's own precision (`Intl.NumberFormat`).
// Parsing rejects currencies outside Ko-fi's documented page-currency set and
// amounts whose fractional digits exceed the currency's exponent.
import { json } from './http.js';

// The Ko-fi destination shown on the support page as an ordinary external
// link. `https://ko-fi.com/purelink/donate` was verified (2026-11, non-paying
// browser navigation) to open this creator's donation panel directly; the
// generic profile page (ko-fi.com/purelink) only reaches it after another
// click. Ko-fi's help center documents /shop, /commissions, and /tiers
// shortcuts but not /donate, and documents no amount- or currency-prefill
// parameters, so the link must never carry invented query parameters:
// supporters choose and confirm the amount on Ko-fi.
export const KOFI_DONATION_URL = 'https://ko-fi.com/purelink/donate';

const MAX_WEBHOOK_BODY_BYTES = 8192;
const MAX_AMOUNT_MINOR_UNITS = 100000000;
const DONATION_TYPE = 'Donation';
// Ko-fi's documented page currencies (Ko-fi Help Center: "Does Ko-fi take a
// fee?"), the creator picks one page currency and the webhook `amount` and
// `currency` are denominated in it. The value is the currency's ISO 4217
// fractional-digit exponent: JPY is the only zero-decimal currency Ko-fi
// offers, every other supported one is two-decimal, and no three-decimal
// currency (KWD, BHD, TND, ...) is offered. Undocumented or future currencies
// fail closed here rather than being stored with an ambiguous unit.
const KOFI_PAGE_CURRENCIES = Object.freeze({
  JPY: 0,
  USD: 2, EUR: 2, GBP: 2, AUD: 2, BRL: 2, CAD: 2, SGD: 2, THB: 2, NZD: 2,
});
const IGNORED_EVENT_TYPES = Object.freeze([
  // Membership payments are explicitly ignored in Phase 1. They are recorded
  // (recognition only) so repeat delivery stays idempotent, but they never
  // create a donation, and membership status never grants entitlements.
  ['Subscription', 'membership'],
  ['Shop Order', 'shop_order'],
  ['Commission', 'commission'],
]);

export function isKofiWebhookConfigured(env) {
  // The token is fail-closed: it must be a real secret of usable length.
  return String(env?.KOFI_WEBHOOK_TOKEN || '').length >= 16;
}

export async function handleKofiWebhook(request, env) {
  if (!isKofiWebhookConfigured(env)) return json({ error: 'Webhook is not configured.' }, { status: 503 });
  const contentType = String(request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (contentType !== 'application/x-www-form-urlencoded') return json({ error: 'Invalid webhook payload.' }, { status: 400 });
  const declaredLength = Number(request.headers.get('content-length') || '');
  if (Number.isSafeInteger(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) return oversizeResponse();
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_WEBHOOK_BODY_BYTES) return oversizeResponse();
  let payload;
  try {
    payload = parseWebhookPayload(rawBody);
  } catch {
    return json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  // Token comparison happens before any provider-derived data is trusted.
  if (typeof payload.verification_token !== 'string' || !constantTimeEqual(payload.verification_token, String(env.KOFI_WEBHOOK_TOKEN))) {
    return json({ error: 'Invalid webhook token.' }, { status: 401 });
  }
  const eventType = typeof payload.type === 'string' ? payload.type : '';
  if (eventType === DONATION_TYPE) return recordDonation(env.pure_link_db, payload);
  const ignoredEvent = IGNORED_EVENT_TYPES.find(([type]) => type === eventType);
  if (ignoredEvent) return recordIgnoredEvent(env.pure_link_db, payload, ignoredEvent[1]);
  return json({ error: 'Unsupported webhook event.' }, { status: 400 });
}

export async function getKofiSupportTotals(db) {
  if (!db) return { publicSupporters: [] };
  const supporters = await db.prepare(`
    SELECT donation.public_name, donation.public_message, donation.public_amount,
      donation.public_display_name, donation.public_message_text,
      donation.amount_text, donation.currency,
      donation.amount_minor - COALESCE(refund.refunded_minor, 0) AS net_amount_minor
    FROM kofi_donations donation
    LEFT JOIN (
      SELECT kofi_transaction_id, SUM(amount_minor) AS refunded_minor
      FROM kofi_refund_reconciliations WHERE kind = 'refund' GROUP BY kofi_transaction_id
    ) refund ON refund.kofi_transaction_id = donation.kofi_transaction_id
    WHERE donation.attribution_state = 'authorized'
      AND (donation.public_name = 1 OR donation.public_message = 1 OR donation.public_amount = 1)
      AND donation.amount_minor > COALESCE(refund.refunded_minor, 0)
    ORDER BY donation.ingested_at DESC LIMIT 24
  `).bind().all();
  return {
    publicSupporters: (supporters?.results || []).map((row) => ({
      name: Number(row.public_name) === 1 ? String(row.public_display_name || '') : '',
      message: Number(row.public_message) === 1 ? neutralizeMentions(String(row.public_message_text || '')) : '',
      amountText: Number(row.public_amount) === 1 && Number(row.net_amount_minor) > 0 ? minorToDecimalText(row.net_amount_minor) : '',
      currency: String(row.currency || ''),
    })),
  };
}

// Display-only integer math: the fixed two-decimal scale back to a major-unit
// decimal string without floating-point arithmetic. For zero-decimal
// currencies the major amount is what `Intl.NumberFormat` formats, so a
// monetary value never changes on display — only the currency's own precision.
function minorToDecimalText(minor) {
  const safe = Math.trunc(Number(minor));
  const major = Math.floor(safe / 100);
  const cents = safe - major * 100;
  return `${major}.${String(cents).padStart(2, '0')}`;
}

async function recordDonation(db, payload) {
  const donation = parseDonationPayload(payload);
  if (!donation) return json({ error: 'Invalid donation payload.' }, { status: 400 });
  const result = await db.prepare(`
    INSERT OR IGNORE INTO kofi_donations (
      kofi_transaction_id, kofi_message_id, receipt_type, amount_minor, amount_text,
      currency, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    donation.transactionId, donation.messageId, donation.receiptType, donation.amountMinor,
    donation.amountText, donation.currency, donation.paidAt,
  ).run();
  if (changes(result) === 0) {
    const existing = await db.prepare(`
      SELECT kofi_transaction_id, kofi_message_id, receipt_type, amount_minor,
        amount_text, currency, paid_at
      FROM kofi_donations WHERE kofi_transaction_id = ?
    `).bind(donation.transactionId).first();
    const identical = Boolean(existing)
      // The delivery id may legitimately differ between redeliveries; the
      // provider payment record is what must stay identical.
      && existing.receipt_type === donation.receiptType
      && Number(existing.amount_minor) === donation.amountMinor
      && existing.amount_text === donation.amountText
      && existing.currency === donation.currency
      && existing.paid_at === donation.paidAt;
    // Never overwrite a recorded transaction. Identical redelivery is
    // acknowledged; conflicting reuse of the same identifier is refused.
    if (!identical) return json({ error: 'Donation conflict.' }, { status: 409 });
  }
  await recordWebhookEvent(db, donation.messageId, donation.receiptType);
  return json({ received: true });
}

async function recordIgnoredEvent(db, payload, receivedEvent) {
  const messageId = validEventId(payload.message_id);
  if (!messageId) return json({ error: 'Invalid donation payload.' }, { status: 400 });
  await recordWebhookEvent(db, messageId, receivedEvent);
  return json({ received: true });
}

async function recordWebhookEvent(db, messageId, receivedEvent) {
  await db.prepare('INSERT OR IGNORE INTO kofi_webhook_events (event_key, message_id, received_event) VALUES (?, ?, ?)').bind(`kofi:${messageId}`, messageId, receivedEvent).run();
}

function parseWebhookPayload(rawBody) {
  const fields = new URLSearchParams(rawBody);
  const dataFields = fields.getAll('data');
  if (dataFields.length !== 1 || !dataFields[0]) throw new Error('missing data field');
  const payload = JSON.parse(dataFields[0]);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload is not an object');
  // Undocumented, future, or irrelevant Ko-fi fields are safely ignored here.
  // Nothing below reads an unvalidated field, so schema extensions can never
  // reach an identity, amount, credit, refund, or publication decision; the
  // fields parsed below are strictly validated where they are actually read.
  return payload;
}

function parseDonationPayload(payload) {
  const messageId = validEventId(payload.message_id);
  const transactionId = validEventId(payload.kofi_transaction_id);
  if (!messageId || !transactionId) return null;
  const timestamp = parseKofiTimestamp(payload.timestamp);
  if (!timestamp) return null;
  const currency = String(payload.currency || '');
  if (!/^[A-Z]{3}$/.test(currency) || !Object.hasOwn(KOFI_PAGE_CURRENCIES, currency)) return null;
  const amountMinor = amountToMinorUnits(payload.amount, KOFI_PAGE_CURRENCIES[currency]);
  if (amountMinor == null) return null;
  // Classification is driven only by strictly typed, payload-decided fields:
  // the documented Donation/Subscription examples always carry a strict
  // is_subscription_payment boolean, and anything else fails closed rather
  // than guessing a receipt type. Unused fields (is_public, from_name,
  // message, url, email, tier_name, shop_items, shipping, ...) are ignored.
  if (typeof payload.is_subscription_payment !== 'boolean') return null;
  return {
    messageId,
    transactionId,
    receiptType: payload.is_subscription_payment ? 'recurring_donation' : 'donation',
    amountMinor,
    amountText: String(payload.amount),
    currency,
    paidAt: timestamp,
  };
}

// Converts an exact decimal string to integer minor units with string math
// only; no floating-point arithmetic touches stored amounts. The fractional
// part must fit the currency's ISO 4217 exponent before the fixed-scale
// conversion, so a zero-decimal currency can never carry sub-unit digits.
function amountToMinorUnits(value, fractionalDigits) {
  if (typeof value !== 'string' || !Number.isInteger(fractionalDigits)) return null;
  const match = /^([0-9]{1,8})(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) return null;
  if ((match[2] || '').length > fractionalDigits) return null;
  const minor = Number(match[1]) * 100 + Number(`${match[2] || ''}00`.slice(0, 2));
  return minor > 0 && minor <= MAX_AMOUNT_MINOR_UNITS ? minor : null;
}

function parseKofiTimestamp(value) {
  const source = String(value ?? '');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(source)) return null;
  if (!Number.isSafeInteger(Date.parse(source))) return null;
  return source;
}

function validEventId(value) {
  const source = String(value ?? '');
  return /^[A-Za-z0-9_-]{8,64}$/.test(source) ? source : '';
}

// Names and messages are never stored before operator attribution, so this
// only sanitizes operator-attributed text at display time.
function neutralizeMentions(value) { return value.replaceAll('@', '@\u200B'); }

function oversizeResponse() { return json({ error: 'Webhook payload is too large.' }, { status: 413 }); }

function changes(result) { return Number(result?.meta?.changes ?? result?.changes ?? 0); }

function constantTimeEqual(left, right) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
