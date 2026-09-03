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

For this production deployment, use `ECPAY_ENVIRONMENT=production`; it selects `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`. `stage` selects the Test Mode endpoint `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`. `PUBLIC_ORIGIN=https://no-no.uk` is also required for the production checkout configuration.

Keep API keys, webhook secrets, and ECPay hashes as Worker secrets. Provider IDs may be ordinary environment variables. Browser requests send only a pack ID and selected enabled rail; server code determines all quantities, prices, and provider fields.

## Confirmation and refunds

Credits are granted only after a verified provider callback: a signed Lemon Squeezy `order_created` webhook or a verified ECPay ReturnURL callback with `RtnCode=1` and `SimulatePaid!=1`. Browser return pages never grant credits.

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

## Test Mode QA

Before production enablement, configure each provider's Test Mode with the three canonical packs and verify: disabled rails produce no checkout buttons; a server-created checkout maps each pack correctly; invalid signatures, unknown orders, wrong store/merchant, and amount mismatches grant nothing; duplicate confirmed callbacks grant once; Lemon cumulative partial then full refunds revoke only the incremental entitlement; ECPay failed and simulated callbacks acknowledge safely without granting. Confirm the account page remains localized and browser return pages do not change credit balances.
