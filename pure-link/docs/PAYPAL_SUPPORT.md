# PayPal one-time support (M1A)

Status: **implemented, disabled by default in every deployment.** Production
checkout is off, no staging deployment has happened yet, and real Sandbox
Webhook delivery has **not** been verified. This document describes the rail and
the exact M1B Staging/Sandbox acceptance procedure.

## Scope

- One-time voluntary support in **USD** through PayPal Orders v2 with hosted
  buyer approval (a redirect to paypal.com — no third-party JavaScript).
- SUPPORT ONLY: no AI-credit purchases. The rail has no user ID, pack ID, or
  credit count anywhere in its tables or handlers.
- ECPay (TWD), Ko-fi tips, and Ko-fi membership are untouched and independent.

## Configuration (fail-closed)

| Variable | Kind | Meaning |
| --- | --- | --- |
| `PAYPAL_ENVIRONMENT` | ordinary var (`wrangler.jsonc`) | `sandbox` or `production`. Selects one hardcoded API origin allowlist; sandbox can never fall back to Live. Staging is pinned to `sandbox`. |
| `PAYPAL_SUPPORT_CHECKOUT_ENABLED` | **secret** | Exact string `true` enables NEW checkouts. Absent/anything else = disabled. Disabling never blocks reconciliation of existing money. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | **secrets** | REST API credential pair. |
| `PAYPAL_WEBHOOK_ID` | **secret** | ID of the webhook as configured in the PayPal developer dashboard; used for remote signature verification. |
| `PAYPAL_MERCHANT_ID` | ordinary var (secret-like; not yet set) | Expected recipient merchant identity (`payee.merchant_id`), snapshotted per checkout and re-verified on every lookup/capture. |
| `PAYPAL_RECONCILE_TOKEN` | **secret** | Bearer token (≥32 chars) for `POST /api/support/paypal/reconcile`. |

Live checkout is additionally bound to the canonical public origin
(`https://no-no.uk`), mirroring the ECPay rail.

## Endpoints

- `POST /api/support/checkout` with `provider: "paypal"` (same-origin,
  Turnstile + rate limiting shared with the other rails).
- `GET /api/payment-return/paypal-support?token=<order id>` — browser return
  from PayPal. Informational only: the order is re-fetched and re-verified
  server-side; nothing is trusted from the browser.
- `POST /api/webhooks/paypal-support` — webhook receiver. Remote
  verify-webhook-signature verification happens before anything is recorded;
  unverified deliveries are refused (401) and never retained.
- `POST /api/support/paypal/reconcile` — operator-only bounded reconciliation
  (Authorization: Bearer). Works while checkout is disabled.

## State machine

`paypal_support_checkouts.status`:
`pending → approved → capture_pending → completed`, or `failed`, or `expired`
(stale, record retained forever — financial records are never deleted).
A locally `failed`/`expired` checkout never outranks authoritative settlement:
a verified completed capture that matches the recorded identity, amount,
currency, and merchant is always recorded.

`paypal_support_contributions.status` (ledger-derived):
`completed → partially_refunded → refunded`, or `reversed`. Refund state is
always recomputed from the append-only `paypal_support_refunds` ledger, so
duplicate, late, and out-of-order events converge; the database refuses
cumulative refunds above the capture.

`paypal_support_contributions.dispute_state` (provider-evidenced, separate from
money state): `none → open → resolved`. Refund accounting can never silently
clear an open dispute; only a PayPal-signed dispute-resolution event for that
capture transitions it.

All capture entry points (browser return, `CHECKOUT.ORDER.APPROVED/COMPLETED`,
`PAYMENT.CAPTURE.COMPLETED`, operator reconciliation) converge on one
idempotent verification: server-side order/capture lookup, exact recipient
merchant, exact USD amount/currency, then `INSERT OR IGNORE` on unique
capture/order/checkout identities. Captures reuse one stable per-checkout
`PayPal-Request-Id`, so parallel callers get the same capture.

Webhook events: verified → durably recorded (`paypal_support_webhook_events`,
with minimal order/capture/refund identifiers — never payloads or personal
data) → processed → 2xx. Processing failures keep the event row (`failed`) and
return 5xx so PayPal retries; the operator reconciliation reprocesses failed
events from those identifiers using PayPal's authenticated lookup APIs
(`GET /v2/checkout/orders/{id}`, `GET /v2/payments/captures/{id}`,
`GET /v2/payments/refunds/{id}`) without requiring the original event payload
or a browser return. Examined checkouts rotate forward on every pass, so a
persistently failing record cannot starve later ones. Unsupported event types
are acknowledged and retained without action.

## Amounts

Presets **$5 / $10 / $20 / $30**; custom range **$3.00–$300.00** (provisional
product defaults, implemented as exact integer minor units — no floats).
Public supporter display only shows consented fields; PayPal payer identity and
email are never stored or published.

## M1B Staging / Sandbox acceptance runbook (do not run yet)

1. **Deploy target**: staging only (`wrangler deploy --env staging`), which is
   pinned to `PAYPAL_ENVIRONMENT=sandbox` and `PAYPAL_SUPPORT_CHECKOUT_ENABLED`
   unset. Never production.
2. **Secrets (staging only, via `wrangler secret put --env staging`)**:
   sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, a sandbox
   `PAYPAL_WEBHOOK_ID`, sandbox `PAYPAL_MERCHANT_ID`, and
   `PAYPAL_SUPPORT_CHECKOUT_ENABLED=true`. No Live credentials anywhere.
3. **D1**: apply migrations to the staging database only
   (`wrangler d1 migrations apply pure-link-staging-v2 --env staging` after a
   backup). Never touch remote production D1.
4. **Webhook**: create a Sandbox webhook in the PayPal developer dashboard
   pointing at `https://staging.no-no.uk/api/webhooks/paypal-support`,
   subscribed to: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`,
   `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`,
   `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
   `PAYMENT.REFUND.PENDING`, `PAYMENT.REFUND.FAILED`,
   `CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED`. Record the webhook ID as the
   staging secret.
5. **Genuine Sandbox e2e**: complete one real Sandbox buyer payment from
   `/en/support` and `/zh-Hant/support`; verify the pending page, then the
   thanks page, the recorded contribution, and webhook event rows.
6. **Webhook resilience**: from the dashboard, resend the capture event
   (replay must ack identically), delete the browser return mid-flow (reconcile
   must complete it), and refund partially then fully (display must show the
   consented net amount and then drop the row).
7. **Negative checks**: wrong-amount and foreign-order captures must never
   record; disabling `PAYPAL_SUPPORT_CHECKOUT_ENABLED` must leave webhook
   processing and reconciliation working.
8. **Only after** all of the above: document results, keep production
   disabled, and open a separate milestone for any production enablement.
