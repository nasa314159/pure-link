# 付款與 AI 公式額度

[English](BILLING.en.md)

PureLink 在 `src/credit-products.js` 有唯一的應用層商品目錄。商品 ID 是 `small`、`standard`、`large`；公開價格與 AI 公式草稿數量如下：

| 方案 | 公開價格 | AI 公式草稿 |
| --- | --- | --- |
| 小型 | NT$150 | 150 |
| 標準 | NT$300 | 400 |
| 大型 | NT$600 | 1,000 |

它們都是只用於 AI 公式草稿的一次性購買。網址縮短、手動公式與小卡仍免費。面向使用者的正式說明以[AI 額度頁](https://no-no.uk/zh-Hant/ai-credits)為準。

## 供應商設定

結帳採 fail-closed：只有啟用旗標明確為 `true` 且設定完整時，付款方式才會顯示。

Lemon Squeezy（國際／Merchant of Record）：

```text
LEMON_SQUEEZY_CHECKOUT_ENABLED=true
LEMON_SQUEEZY_API_KEY=...
LEMON_SQUEEZY_WEBHOOK_SECRET=...
LEMON_SQUEEZY_STORE_ID=...
LEMON_SQUEEZY_VARIANT_SMALL_ID=...
LEMON_SQUEEZY_VARIANT_STANDARD_ID=...
LEMON_SQUEEZY_VARIANT_LARGE_ID=...
```

可選的 Pay What You Want 支持還需要 `LEMON_SQUEEZY_SUPPORT_VARIANT_ID`。它使用獨立帳本、提供 0 點額度，且公開署名必須由支持者明確同意。

ECPay（台灣）：

```text
ECPAY_CHECKOUT_ENABLED=true
ECPAY_ENVIRONMENT=stage # 或 production
ECPAY_MERCHANT_ID=...
ECPAY_HASH_KEY=...
ECPAY_HASH_IV=...
```

API key、webhook secret 與 ECPay hash 必須使用 Worker secret。供應商 ID 可使用一般環境變數。瀏覽器只會傳送方案 ID 與已啟用的付款方式；價格、額度與供應商欄位皆由伺服器決定。

## 確認付款與退款

額度只能在已驗證的供應商通知後加入：Lemon Squeezy 已簽名的 `order_created` webhook，或 `RtnCode=1` 且 `SimulatePaid!=1` 的 ECPay ReturnURL。瀏覽器回到成功頁永遠不會加入額度。

Lemon 退款 webhook 使用供應商提供的累積 `total`、`refunded_amount`、`total_usd`、`refunded_amount_usd`。若已驗證退款早於 `order_created` 到達，會先保留並在訂單到達後對帳。重複通知只會撤回新增的相稱額度；支持總額也只扣除相對應的退款美元金額。ECPay 退款目前由商家／營運端處理；PureLink 不宣稱支援自動 ECPay 退款 API。

歷史 Creem migration `0006`、資料表與已驗證 webhook 相容邏輯會保留，以支援既有紀錄。新的 Creem 結帳不會公開；只有歷史自架部署刻意設定 `CREEM_LIVE_CHECKOUT_ENABLED=true` 時才可能啟用。舊的 `CREEM_PRODUCT_300_ID` 只能在不再需要歷史相容時由維運人員手動移除。

## Test Mode QA

正式啟用前，請在兩個供應商的 Test Mode 建立三個正式方案，並確認：停用供應商不顯示結帳按鈕；伺服器建立的結帳正確對應每個方案；無效簽名、未知訂單、錯誤商店／商家與金額不符都不會加入額度；重複確認通知只加入一次；Lemon 累積部分退款後全額退款只撤回新增的權益；ECPay 失敗與模擬通知會安全確認收到但不加入額度。同時確認帳號頁保持正確語言，且瀏覽器回到付款結果頁不會改變額度餘額。
