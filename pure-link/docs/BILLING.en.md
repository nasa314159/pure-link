# Billing and AI formula credits

[繁體中文](BILLING.zh-Hant.md)

PureLink has one application product catalog in `src/credit-products.js`. Product IDs are `small`, `standard`, and `large`; their authoritative public prices and AI formula draft quantities are:

| Pack | Display price | AI formula drafts |
| --- | --- | --- |
| Small | NT$150 | 150 |
| Standard | NT$300 | 400 |
| Large | NT$600 | 1,000 |

They are one-time purchases for AI formula drafts only. URL shortening, manual formulas, and Cards remain free. The public source of customer-facing information is [the AI credits page](https://no-no.uk/en/ai-credits).

## Provider configuration

Checkout is fail-closed. It is visible only when a rail's enable flag is exactly `true` and its complete configuration is present.

New AI-credit purchases additionally require the deployment-wide gate `AI_CREDIT_PURCHASES_ENABLED` to be the exact string `true`. It is absent, unset, or `false` in the production configuration, so production checkout stays disabled regardless of provider settings; only a deliberately configured non-production deployment may set it. Absent, empty, `false`, and malformed values are all fail-closed (`true ` trimmed whitespace counts; `TRUE`, `1`, `on`, and typos never enable). This gate affects only NEW checkouts: webhooks, credit balances, already-created orders, refunds, and the independent support rails are unchanged either way.

The production deployment uses `https://no-no.uk` as its public origin. Keep this value configured so provider callbacks and browser result pages cannot be redirected to a request-dependent origin.

Lemon Squeezy (international / merchant of record):

```text
LEMON_SQUEEZY_CHECKOUT_ENABLED=true
LEMON_SQUEEZY_API_KEY=...
LEMON_SQUEEZY_WEBHOOK_SECRET=...
LEMON_SQUEEZY_STORE_ID=...
LEMON_SQUEEZY_VARIANT_SMALL_ID=...
LEMON_SQUEEZY_VARIANT_STANDARD_ID=...
LEMON_SQUEEZY_VARIANT_LARGE_ID=...
```

Optional Pay What You Want support also needs `LEMON_SQUEEZY_SUPPORT_VARIANT_ID`. It is a separate ledger, grants zero credits, and public attribution requires an explicit opt-in.

ECPay (Taiwan):

```text
PUBLIC_ORIGIN=https://no-no.uk
ECPAY_CHECKOUT_ENABLED=true
ECPAY_ENVIRONMENT=stage # or production
ECPAY_MERCHANT_ID=...
ECPAY_HASH_KEY=...
ECPAY_HASH_IV=...
```

Voluntary support through ECPay is separately fail-closed. It uses the same existing ECPay credentials, but requires its own ordinary Worker variable:

```text
ECPAY_SUPPORT_CHECKOUT_ENABLED=true
```

Keep `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, and `ECPAY_HASH_IV` as Worker secrets; `ECPAY_CHECKOUT_ENABLED`, `ECPAY_SUPPORT_CHECKOUT_ENABLED`, `ECPAY_ENVIRONMENT`, and `PUBLIC_ORIGIN` are non-secret Worker variables. Enabling support does not enable AI-credit checkout, and enabling AI-credit checkout does not enable support.

For this production deployment, use `ECPAY_ENVIRONMENT=production`; it selects `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`. `stage` selects the Test Mode endpoint `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`. `PUBLIC_ORIGIN=https://no-no.uk` is also required for the production checkout configuration.

Keep API keys, webhook secrets, and ECPay hashes as Worker secrets. Provider IDs may be ordinary environment variables. Browser requests send only a pack ID and selected enabled rail; server code determines all quantities, prices, and provider fields.

TWQR is an ECPay All-in-One hosted payment method, not a separate PureLink rail. PureLink intentionally sends `ChoosePayment=ALL`, so ECPay presents every payment method activated for this merchant, including TWQR after its ECPay/O'Pay activation. Do not change this to `TWQR`, which would force a TWQR-only checkout and hide the existing hosted methods.

## Confirmation and refunds

Credits are granted only after a verified provider callback: a signed Lemon Squeezy `order_created` webhook or a verified ECPay ReturnURL callback with `RtnCode=1` and `SimulatePaid!=1`. ECPay `ReturnURL` is always `https://no-no.uk/api/webhooks/ecpay`, the only ECPay fulfillment endpoint. ECPay posts browser results to `https://no-no.uk/api/payment-return/ecpay?locale=en` or `?locale=zh-Hant`; that endpoint ignores all POST fields and responds with a `303` to the matching localized pending account page. `ClientBackURL` is the canonical `https://no-no.uk/{locale}/account?purchase=pending` page for payment methods with different browser-return behavior. Browser returns never grant credits.

Lemon refund webhooks use the provider's cumulative `total`, `refunded_amount`, `total_usd`, and `refunded_amount_usd` fields. Verified refunds received before `order_created` are retained and reconciled when the order arrives. Repeated notifications revoke only the additional proportional credits and support totals only lose the corresponding refunded USD amount. ECPay refunds are currently handled by the merchant/operator; PureLink does not claim an automatic ECPay refund API.

Historical Creem migration `0006`, tables, and authenticated webhook compatibility remain for existing records. New Creem checkout is not exposed and remains disabled unless the legacy `CREEM_LIVE_CHECKOUT_ENABLED=true` configuration is deliberately used by a self-hosted historical deployment. The old `CREEM_PRODUCT_300_ID` configuration can be removed manually only after historical compatibility is no longer needed.

## Manual production QA

Before setting `ECPAY_CHECKOUT_ENABLED=true` in production:

- Confirm the production ECPay merchant review is approved and the production MerchantID, HashKey, and HashIV are stored as Worker secrets.
- Confirm `ECPAY_ENVIRONMENT=production` and `PUBLIC_ORIGIN=https://no-no.uk`; never put credentials in Git or `wrangler.jsonc`.
- From both `/en/ai-credits` and `/zh-Hant/ai-credits`, verify the localized ECPay Taiwan rail and one-time purchase wording; the account page must show only configured rails.
- Sign in and create each `small`, `standard`, and `large` checkout. Confirm ECPay receives exactly NT$150/150, NT$300/400, and NT$600/1,000 respectively.
- Complete one real low-risk transaction and verify the signed callback reaches `/api/webhooks/ecpay`, credits the purchasing account once, and records the expected order.
- Return to the browser result URL before the callback arrives and confirm it remains informational; a browser return is not proof of fulfillment.
- Replay the same callback, send a failed callback, send a simulated callback, and test invalid signature, wrong merchant, wrong amount, and unknown trade number. None may grant additional credits.
- Follow the merchant's ECPay refund process and reconcile the account/order manually; this integration does not claim an automatic ECPay refund API.

The verified server-side ECPay callback is authoritative for fulfillment. The browser return page only explains that PureLink is waiting for provider confirmation.

## Voluntary support (ECPay NTD)

Support is not an AI-credit product. It is an optional, one-time contribution for open-source development, hosting, maintenance, and service costs. It provides no credits, features, subscription, priority, target, investment, or other product benefit.

The support page offers NT$100, NT$300, NT$500, and NT$1,000 suggestions and accepts a whole-number custom amount from NT$50 through NT$10,000. The Worker validates that range and stores the expected amount before creating the ECPay order; browser input never selects a credit quantity.

Support has dedicated `ecpay_support_checkout_requests` and `ecpay_support_contributions` tables. They have no user, pack, credit, balance, or credit-granting trigger. ECPay support uses `ReturnURL=https://no-no.uk/api/webhooks/ecpay-support`; only its verified callback can insert a contribution. The callback verifies CheckMacValue, MerchantID, the known pending checkout, exact amount, `RtnCode=1`, `SimulatePaid=0`, and a unique ECPay trade number. Exact duplicate notifications acknowledge safely without creating a second contribution. The support browser POST goes to `/api/payment-return/ecpay-support?locale=...`, ignores all fields, and returns `303` to the localized `/support?support=pending` page. `ClientBackURL` also points to that canonical informational page.

Public attribution is private by default. A supporter separately chooses whether to publish an optional name, optional message, and/or amount after verified payment. PureLink does not copy Google profile data, billing email, billing name, ECPay IDs, or other provider details into the public list. Names are limited to 60 characters and the ledger accepts messages up to 2,000 characters; the current form may keep a lower input limit until its UX update ships. HTML is escaped and `@` is neutralized before rendering. D1 `CURRENT_TIMESTAMP` ledger timestamps are authoritative UTC values; upgrades preserve them without converting them to Taiwan local time.

The support page renders a server-generated NTD cumulative staircase from verified contributions only. ECPay support refunds are intentionally **not** initiated automatically by this Worker. The operator must first complete and verify the appropriate refund in ECPay or its merchant console, then append a matching `refund` row to `ecpay_support_reconciliations` (with the original `merchant_trade_no`, refunded NTD amount, and an internal note). The public net total and history subtract those reconciliations; this never affects AI credits. Do not record a refund solely from a browser return or an unverified customer claim.

Lemon Squeezy's historical support tables and signed webhook path remain intact for international support records. They are not reused by the ECPay NTD ledger and are not automatically enabled by this change.

## Ko-fi donation receipts (Phase 1)

Ko-fi lets supporters pay the creator directly (Ko-fi/PayPal/Stripe), so PureLink cannot verify money movement itself. Ko-fi donation receipts are recorded as provider-emitted bookkeeping on a dedicated rail. They have their own tables (`kofi_donations`, `kofi_webhook_events`, `kofi_refund_reconciliations`), no user, pack, credit, balance, or credit-granting trigger, and they are never mixed into AI-credit orders or balances. A Ko-fi event can never infer a PureLink account or grant any entitlement; Ko-fi membership payments are explicitly ignored in Phase 1 (recorded as `membership` webhook events, recognition-only, never donations).

### Webhook receive path

`POST /api/webhooks/kofi` expects Ko-fi's `application/x-www-form-urlencoded` delivery (one `data` form field containing the JSON payload) and validates it strictly: one `data` field, exact verification-token comparison with `constantTimeEqual`, an 8 KiB body limit, positive decimal amounts converted to integer minor units with string math (no floating point), a 3-letter uppercase currency, an ISO-8601 UTC `timestamp`, validated payment identifiers, and a strict `is_subscription_payment` boolean for receipt classification. Documented required fields (`verification_token`, `message_id`, `timestamp`, `type`, `amount`, `currency`, `kofi_transaction_id`) are never tolerated as absent. Undocumented, future, or irrelevant Ko-fi fields (including `is_public`, `from_name`, `message`, `url`, and `email`) are safely ignored and never used for identity, amount, credit, refund, or publication decisions. Supported payment events are only `type: "Donation"` (with the strict `is_subscription_payment` boolean distinguishing one-time from recurring monthly donation payments). `Subscription`, `Shop Order`, and `Commission` events are acknowledged and preserved in `kofi_webhook_events` as `membership`/`shop_order`/`commission` without recording a donation; any other event type is rejected.

Ko-fi's verification token rides inside the payload and does not bind the payload fields, so it is deliberately **weaker** than ECPay's CheckMacValue or Lemon Squeezy's body HMAC. The token is stored only as a Worker secret (`KOFI_WEBHOOK_TOKEN`, fail-closed when absent or shorter than 16 characters). The Worker never logs the token, webhook body, or payer email. The receiver is receive-only: no AI credits, no membership recognition, no backfill of history (Ko-fi only notifies about new payments).

Deduplication is database-enforced: `kofi_transaction_id` is the `kofi_donations` primary key and `kofi_message_id` is UNIQUE, so repeated delivery of the same webhook message is idempotent, and conflicting payloads that reuse a recorded identifier are refused (HTTP 409) without ever overwriting the stored amount, currency, receipt type, or timestamp.

### Privacy and operator attribution

Every new Ko-fi receipt is private on PureLink (`attribution_state = 'private'`), regardless of the Ko-fi `is_public` flag. Public display is not derived from ingestion, and the Ko-fi payload's `email`, personal message, and display name are never stored during ingest. Donor names, messages, or exact amounts appear on the support page only after an operator records a separate PureLink attribution decision, with each element (name, message, amount) opted in independently:

1. Verify the donation receipt in the Ko-fi transaction history and its PayPal/Stripe counterpart.
2. Confirm the supporter separately wants their name, message, and/or amount published (Ko-fi's `is_public` flag alone is not treated as consent on PureLink).
3. Record the operator-sanitized attribution (≤60 characters for the name, ≤2000 for the message; advice `@` is neutralized before rendering; HTML is escaped at render time), e.g.:
   `wrangler d1 execute pure-link-production --remote --command "UPDATE kofi_donations SET attribution_state = 'authorized', public_name = 1, public_display_name = '<name>', public_message = 1, public_message_text = '<message>', public_amount = 1 WHERE kofi_transaction_id = '<transaction id>'"`
   Set only the flags the supporter actually authorized and leave the rest at their defaults.
4. Attributed rows then render in their own receipt currency with the existing supporter-list design. Receipt currencies are never summed or converted against each other, and the existing NTD totals, history chart, and ECPay donation semantics are unchanged.

### Refunds and reconciliation

Ko-fi does not emit refund webhooks, and refund state is never inferred from later payment events. Refunds are recorded manually in the append-only `kofi_refund_reconciliations` ledger only after the actual refund is completed and verified in the Ko-fi/PayPal/Stripe console ( mirroring the ECPay workflow): the operator inserts one `refund` row per verified refund with the original `kofi_transaction_id`, the refunded amount in minor units, the donation's currency, and an internal note. Database triggers reject unknown transactions, currency mismatches, cumulative refunds above the donation, and edits to recorded rows. A fully refunded donation disappears from the attributed supporter list. Do not record a refund from a browser return, email claim, or unverified screenshot.

### Configuration and QA

- Operator steps: create the webhook at `https://ko-fi.com/manage/webhooks` pointing at `https://no-no.uk/api/webhooks/kofi`, and store `KOFI_WEBHOOK_TOKEN` as a Worker secret. The endpoint 503s unless the token is present, so configuration is fail-closed.
- Do not trigger the Ko-fi developer-console test webhooks in production until deliberate QA is authorized; synthetic fixtures in `test/kofi.spec.js` cover the receive path.
- Currency limitation (documented assumption): Ko-fi decimal strings are converted assuming two-decimal currency presentation. If Ko-fi payloads for zero-decimal currencies turn out to differ, bring that to the owner before enabling display rather than widening the receiver.

### Migration and rollback (Ko-fi)

- Migration `0014_kofi_donations.sql` is additive only: it creates new `kofi_*` tables, triggers, and indexes but never rebuilds, alters, or drops any existing financial table (ECPay, Lemon Squeezy, Creem, AI-credit balances).
- Staging first: `npx --no-install wrangler d1 migrations apply pure-link-staging --remote`, then confirm `wrangler d1 migrations list pure-link-staging --remote` shows it applied and `npx --no-install wrangler d1 execute pure-link-staging --remote --command "SELECT name, sql FROM sqlite_master WHERE name LIKE 'kofi_%'"` shows the expected tables/triggers.
- Production preflight: `npx --no-install wrangler d1 migrations list pure-link-production --remote` (expect only `0014` pending), then take a backup before applying: `npx --no-install wrangler d1 export pure-link-production --remote --output=backup-before-0014.sql`. D1 Time Travel additionally provides point-in-time restore for 30 days.
- Applied migrations are inspected with `wrangler d1 migrations list pure-link-production --remote`; webhook diagnostics use id-only event rows (never payloads): `SELECT received_event, message_id, created_at FROM kofi_webhook_events ORDER BY created_at DESC LIMIT 20`. `received_event` distinguishes `donation`/`recurring_donation` receipts from ignored `membership`/`shop_order`/`commission` events.
- Ingestion is disabled at any time by removing the token: `npx wrangler secret delete KOFI_WEBHOOK_TOKEN`. The endpoint then responds 503 fail-closed and nothing else changes; recorded receipts are unaffected.
- Always retain the production Ko-fi donation tables after any code rollback. They are the only ledger of support actually received: deleting them would falsify financial records, and Ko-fi redeliveries rely on the same UNIQUE guards (duplicates stay idempotent, conflicts stay refused). Re-deploying the feature reuses the same tables; do not treat dropping real donation records as a routine rollback.


### Support production QA

- Store the existing ECPay MerchantID, HashKey, and HashIV only as Worker secrets; set `ECPAY_ENVIRONMENT=production`, `PUBLIC_ORIGIN=https://no-no.uk`, and `ECPAY_SUPPORT_CHECKOUT_ENABLED=true` as variables only after the migration is applied by an operator.
- Check `/en/support` and `/zh-Hant/support`: private is the default; each attribution choice is independent; suggested and custom amounts are bounded; and the UI promises no benefit.
- Create a low-value NT$100 support order. Confirm the signed ECPay fields use the support-specific ReturnURL, browser return URL, ClientBackURL, exact NTD amount, and `ChoosePayment=ALL`.
- Complete a real payment only when deliberately authorized for QA. Confirm one verified callback creates one support contribution, the NTD total/history update, no AI-credit balance changes, and browser returns alone do nothing.
- Replay the exact verified callback and verify it stays one contribution. Test an invalid MAC, wrong MerchantID, wrong amount, simulated callback, failed callback, and forged browser return; none may record support or affect credits.
- For a refund, use the merchant-approved ECPay procedure first, verify its outcome, then record the manual reconciliation and confirm the support total/history decrease by the verified amount.

## Test Mode QA

Before production enablement, configure each provider's Test Mode with the three canonical packs and verify: disabled rails produce no checkout buttons; a server-created checkout maps each pack correctly; invalid signatures, unknown orders, wrong store/merchant, and amount mismatches grant nothing; duplicate confirmed callbacks grant once; Lemon cumulative partial then full refunds revoke only the incremental entitlement; ECPay failed and simulated callbacks acknowledge safely without granting. Confirm the account page remains localized and browser return pages do not change credit balances.
