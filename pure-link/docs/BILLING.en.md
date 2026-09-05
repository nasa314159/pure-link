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

### Support production QA

- Store the existing ECPay MerchantID, HashKey, and HashIV only as Worker secrets; set `ECPAY_ENVIRONMENT=production`, `PUBLIC_ORIGIN=https://no-no.uk`, and `ECPAY_SUPPORT_CHECKOUT_ENABLED=true` as variables only after the migration is applied by an operator.
- Check `/en/support` and `/zh-Hant/support`: private is the default; each attribution choice is independent; suggested and custom amounts are bounded; and the UI promises no benefit.
- Create a low-value NT$100 support order. Confirm the signed ECPay fields use the support-specific ReturnURL, browser return URL, ClientBackURL, exact NTD amount, and `ChoosePayment=ALL`.
- Complete a real payment only when deliberately authorized for QA. Confirm one verified callback creates one support contribution, the NTD total/history update, no AI-credit balance changes, and browser returns alone do nothing.
- Replay the exact verified callback and verify it stays one contribution. Test an invalid MAC, wrong MerchantID, wrong amount, simulated callback, failed callback, and forged browser return; none may record support or affect credits.
- For a refund, use the merchant-approved ECPay procedure first, verify its outcome, then record the manual reconciliation and confirm the support total/history decrease by the verified amount.

## Test Mode QA

Before production enablement, configure each provider's Test Mode with the three canonical packs and verify: disabled rails produce no checkout buttons; a server-created checkout maps each pack correctly; invalid signatures, unknown orders, wrong store/merchant, and amount mismatches grant nothing; duplicate confirmed callbacks grant once; Lemon cumulative partial then full refunds revoke only the incremental entitlement; ECPay failed and simulated callbacks acknowledge safely without granting. Confirm the account page remains localized and browser return pages do not change credit balances.
