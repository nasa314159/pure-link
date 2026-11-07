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

新的 AI 額度購買另外需要部署層級的總開關 `AI_CREDIT_PURCHASES_ENABLED` 明確設為字串 `true`。正式環境設定中沒有這個變數（或為 `false`），因此無論供應商設定如何，正式結帳一律停用；只有刻意設定的非正式測試部署可以打開。缺少、空白、`false` 或無法辨識的值全部 fail-closed（允許前後空白後恰好為 `true`；`TRUE`、`1`、`on` 或拼錯一律不啟用）。這個開關只影響「新的」結帳：webhook、額度餘額、已建立的訂單、退款與獨立的支持軌道都不受影響。

正式部署的公開來源是 `https://no-no.uk`。請保留這個設定，讓供應商回呼與瀏覽器結果頁不會依賴請求來源而被導向其他網域。

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
PUBLIC_ORIGIN=https://no-no.uk
ECPAY_CHECKOUT_ENABLED=true
ECPAY_ENVIRONMENT=stage # 或 production
ECPAY_MERCHANT_ID=...
ECPAY_HASH_KEY=...
ECPAY_HASH_IV=...
```

透過 ECPay 的自願支持採用獨立 fail-closed 開關，沿用既有 ECPay 憑證，但還需要另一個一般 Worker 變數：

```text
ECPAY_SUPPORT_CHECKOUT_ENABLED=true
```

`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY` 與 `ECPAY_HASH_IV` 必須是 Worker secret；`ECPAY_CHECKOUT_ENABLED`、`ECPAY_SUPPORT_CHECKOUT_ENABLED`、`ECPAY_ENVIRONMENT` 與 `PUBLIC_ORIGIN` 是非機密 Worker 變數。啟用支持不會啟用 AI 額度結帳，啟用 AI 額度結帳也不會啟用支持。

正式環境請使用 `ECPAY_ENVIRONMENT=production`，它會選擇 `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`；`stage` 會選擇 Test Mode 的 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`。正式結帳設定也必須有 `PUBLIC_ORIGIN=https://no-no.uk`。

API key、webhook secret 與 ECPay hash 必須使用 Worker secret。供應商 ID 可使用一般環境變數。瀏覽器只會傳送方案 ID 與已啟用的付款方式；價格、額度與供應商欄位皆由伺服器決定。

TWQR 是 ECPay 全方位金流的導轉付款方式，不是另一條 PureLink 金流。PureLink 會固定傳送 `ChoosePayment=ALL`，因此 ECPay 會顯示此商家已開通的付款方式；完成 ECPay／歐付寶啟用後，包含 TWQR。請勿改為 `TWQR`，否則會變成僅限 TWQR 的結帳頁，隱藏既有的導轉付款方式。

## 確認付款與退款

額度只能在已驗證的供應商通知後加入：Lemon Squeezy 已簽名的 `order_created` webhook，或 `RtnCode=1` 且 `SimulatePaid!=1` 的 ECPay ReturnURL。ECPay 的 `ReturnURL` 固定為 `https://no-no.uk/api/webhooks/ecpay`，是唯一可交付額度的 ECPay 端點。ECPay 會將瀏覽器結果 POST 到 `https://no-no.uk/api/payment-return/ecpay?locale=en` 或 `?locale=zh-Hant`；該端點會忽略全部 POST 欄位，並以 `303` 轉址至對應語言的待確認帳號頁。對於瀏覽器返回行為不同的付款方式，`ClientBackURL` 固定使用 `https://no-no.uk/{locale}/account?purchase=pending`。瀏覽器返回永遠不會加入額度。

Lemon 退款 webhook 使用供應商提供的累積 `total`、`refunded_amount`、`total_usd`、`refunded_amount_usd`。若已驗證退款早於 `order_created` 到達，會先保留並在訂單到達後對帳。重複通知只會撤回新增的相稱額度；支持總額也只扣除相對應的退款美元金額。ECPay 退款目前由商家／營運端處理；PureLink 不宣稱支援自動 ECPay 退款 API。

歷史 Creem migration `0006`、資料表與已驗證 webhook 相容邏輯會保留，以支援既有紀錄。新的 Creem 結帳不會公開；只有歷史自架部署刻意設定 `CREEM_LIVE_CHECKOUT_ENABLED=true` 時才可能啟用。舊的 `CREEM_PRODUCT_300_ID` 只能在不再需要歷史相容時由維運人員手動移除。

## 正式環境人工 QA

在正式環境設定 `ECPAY_CHECKOUT_ENABLED=true` 前：

- 確認 ECPay 商家審核已通過，並將正式 MerchantID、HashKey、HashIV 存為 Worker secrets。
- 確認 `ECPAY_ENVIRONMENT=production` 與 `PUBLIC_ORIGIN=https://no-no.uk`；絕不把憑證提交到 Git 或 `wrangler.jsonc`。
- 從 `/en/ai-credits` 與 `/zh-Hant/ai-credits` 檢查繁簡體一致的 ECPay 台灣付款方式與一次性購買說明；帳號頁只顯示已完整設定的付款方式。
- 登入後分別建立 `small`、`standard`、`large` 結帳，確認 ECPay 收到的金額與額度分別是 NT$150/150、NT$300/400、NT$600/1,000。
- 完成一筆低風險正式交易，確認已簽名回呼抵達 `/api/webhooks/ecpay`，只替發起購買的帳號加入一次額度，並記錄正確訂單。
- 在回呼抵達前先返回瀏覽器結果頁，確認頁面只有說明用途；瀏覽器返回不是交付證明。
- 重送相同回呼，並測試失敗回呼、模擬付款、無效簽名、錯誤商家、錯誤金額與未知交易號，均不得加入額度。
- 依 ECPay 商家退款流程人工處理並對帳；本整合不宣稱提供自動 ECPay 退款 API。

已驗證的伺服器端 ECPay 回呼才是交付額度的權威來源。瀏覽器返回頁只會說明 PureLink 正等待供應商確認。

## 自願支持（ECPay NTD）

支持不是 AI 額度商品，而是用於開源開發、主機、維護與服務成本的可選一次性貢獻。它不提供額度、功能、訂閱、優先權、目標、投資或其他產品權益。

支持頁提供 NT$100、NT$300、NT$500、NT$1,000 建議金額，並接受 NT$50 至 NT$10,000 的整數自訂金額。Worker 會在建立 ECPay 訂單前驗證範圍並保存預期金額；瀏覽器輸入永遠不能選擇額度數量。

支持使用專屬的 `ecpay_support_checkout_requests` 與 `ecpay_support_contributions` 資料表，沒有使用者、方案、額度、餘額欄位或加入額度的 trigger。ECPay 支持固定使用 `ReturnURL=https://no-no.uk/api/webhooks/ecpay-support`；只有已驗證的回呼能新增支持紀錄。回呼會驗證 CheckMacValue、MerchantID、已知的待處理訂單、精確金額、`RtnCode=1`、`SimulatePaid=0` 與唯一的 ECPay 交易號。完全相同的重複通知只會安全確認，不會新增第二筆支持。支持的瀏覽器 POST 會到 `/api/payment-return/ecpay-support?locale=...`，忽略所有欄位並以 `303` 導向對應語言的 `/support?support=pending`。`ClientBackURL` 同樣指向這個固定的資訊頁。

公開署名預設為私人。支持者可分別選擇在付款驗證後公開選填名稱、選填留言與／或金額。PureLink 不會自動公開 Google 個人資料、帳單電子郵件、帳單姓名、ECPay ID 或其他供應商資料。名稱上限為 60 個字元，帳本接受最多 2,000 個字元的留言；目前表單可維持較低的輸入上限，直到 UX 更新上線。顯示時會 HTML 跳脫並中和 `@`。D1 的 `CURRENT_TIMESTAMP` 帳本時間戳是權威 UTC 值；升級會原樣保留，不會轉換為台灣當地時間。

支持頁從已驗證支持建立伺服器端 NTD 累積階梯圖。ECPay 支持退款刻意**不**由此 Worker 自動發起。營運人員必須先在 ECPay 或商家後台完成並驗證正確的退款，再新增相對應的 `ecpay_support_reconciliations` `refund` 紀錄（原始 `merchant_trade_no`、退款 NTD 金額與內部備註）。公開淨額與歷程會扣除該筆對帳，但永遠不影響 AI 額度。不能只因瀏覽器返回或未驗證的使用者聲明就記錄退款。

Lemon Squeezy 的歷史支持資料表與已簽名 webhook 路徑會完整保留，以支援國際支持紀錄。本次變更不會重用它們作為 ECPay NTD 帳本，也不會自動啟用它們。

## Ko-fi 捐款收據（Phase 1）

Ko-fi 讓支持者直接向創作者付款（Ko-fi/PayPal/Stripe），因此 PureLink 無法自行驗證款項是否到帳。Ko-fi 捐款收據只作為供應商發出的記帳憑證，記錄在專屬軌道上。資料表完全獨立（`kofi_donations`、`kofi_webhook_events`、`kofi_refund_reconciliations`），沒有使用者、方案、額度、餘額或加額觸發器，絕不與 AI 額度訂單或餘額混用。Ko-fi 事件永遠不會推導出 PureLink 帳號，也不會授予任何權益；Ko-fi 會員付款在 Phase 1 明確忽略（只以 `membership` webhook 事件留作識別，絕不記為捐款）。

### Webhook 接收路徑

`POST /api/webhooks/kofi` 只接受 Ko-fi 的 `application/x-www-form-urlencoded` 傳送格式（單一 `data` 欄位內含 JSON 負載），並嚴格驗證：單一 `data` 欄位、verification token 以 `constantTimeEqual` 恆時比對、8 KiB 請求上限、正數小數金額以字串運算轉為整數最小單位（不使用浮點運算）、三個大寫字母的幣別、ISO-8601 UTC `timestamp`、付款識別碼驗證，以及用於收據分類的嚴格布林 `is_subscription_payment`。文件所列的必要欄位（`verification_token`、`message_id`、`timestamp`、`type`、`amount`、`currency`、`kofi_transaction_id`）絕不容許缺失。未記載、未來新增或無關的 Ko-fi 欄位（包括 `is_public`、`from_name`、`message`、`url`、`email`）一律安全忽略，絕不用於身分、金額、額度、退款或公開決定。受支援的付款事件只有 `type: "Donation"`（以嚴格布林 `is_subscription_payment` 區分單次與每月定期捐款付款）。`Subscription`、`Shop Order`、`Commission` 事件只會確認並記錄在 `kofi_webhook_events`（`membership`／`shop_order`／`commission`），不會記為捐款；其他任何事件類型直接拒絕。

Ko-fi 的驗證 token 內嵌於負載之中，無法綁定負載欄位，因此刻意視為**弱於** ECPay CheckMacValue 與 Lemon Squeezy 的 body HMAC。token 只存為 Worker secret（`KOFI_WEBHOOK_TOKEN`；短缺於 16 字元或不存在時一律關閉）。Worker 絕不記錄 token、webhook 內容或付款人 email。接收端純屬收據性質：不加 AI 額度、不識別會員、不回填歷史（Ko-fi 只通知新付款）。

去重由資料庫強制：`kofi_transaction_id` 是 `kofi_donations` 主鍵、`kofi_message_id` 有 UNIQUE 約束，因此同一則 webhook 的重複投遞是冪等的；重用既有識別碼但內容衝突的負載會被拒絕（HTTP 409），絕不覆寫已儲存的金額、幣別、收據類型或時間戳。

### 隱私與營運人員歸屬設定

每筆新的 Ko-fi 收據在 PureLink 一律為私密（`attribution_state = 'private'`），與 Ko-fi 的 `is_public` 旗標無關。公開顯示絕不因收錄而自動發生，收錄時也不會儲存負載中的 `email`、留言或顯示名稱。只有在營運人員另行記錄 PureLink 的歸屬決定後，支持者名稱、留言或確切金額才會出現在支持頁，且名稱、留言、金額各自獨立授權：

1. 先在 Ko-fi 交易紀錄與對應的 PayPal/Stripe 帳單中驗證收據。
2. 向支持者另行確認願意公開名稱、留言和／或金額（Ko-fi 的 `is_public` 不視為 PureLink 上的同意）。
3. 記錄營運人員整理過的歸屬內容（名稱 ≤60 字元、留言 ≤2000 字元；渲染前 `@` 會加上零寬字元中和，HTML 於渲染時跳脫），例如：
   `wrangler d1 execute pure-link-production --remote --command "UPDATE kofi_donations SET attribution_state = 'authorized', public_name = 1, public_display_name = '<name>', public_message = 1, public_message_text = '<message>', public_amount = 1 WHERE kofi_transaction_id = '<transaction id>'"`
   只設定支持者實際授權的旗標，其餘保持預設。
4. 已歸屬的項目隨後以收款幣別、沿用既有支持者列表設計呈現。收款幣別之間永遠不會加總或換算，既有的 NTD 總額、歷程圖與 ECPay 捐款語意維持不變。

### 退款與對帳

Ko-fi 不會發送退款 webhook，退款狀態也絕不會從後續付款事件推導。只有在 Ko-fi/PayPal/Stripe 後台完成並核對實際退款後（與 ECPay 流程相同），才以人工方式在附加-only 的 `kofi_refund_reconciliations` 帳本記錄：以原始 `kofi_transaction_id`、退款金額（最小單位）、該捐款幣別與內部註記新增 `refund` 列。資料庫觸發器會拒絕未知交易、幣別不符、超過原捐款的累計退款，以及對已記錄列的修改。完全退款的捐款會從已歸屬的支持者列表消失。絕不依瀏覽器返回、來信說法或未核對的截圖記錄退款。

### 設定與 QA

- 營運步驟：在 `https://ko-fi.com/manage/webhooks` 建立 webhook 指向 `https://no-no.uk/api/webhooks/kofi`，並將 `KOFI_WEBHOOK_TOKEN` 存為 Worker secret。token 不存在時端點一律回 503，屬於 fail-closed。
- 在獲得明確 QA 授權之前，不要在正式環境觸發 Ko-fi 開發者控制台的測試 webhook；`test/kofi.spec.js` 的合成 fixtures 已涵蓋接收路徑。
- 幣別限制（既有假設）：Ko-fi 的小數字串以兩位小數幣別呈現假設進行轉換。若零小數位幣別的實際負載與此不同，先回報負責人再啟用顯示，不要擴大接收器。

### Migration 與回滚（Ko-fi）

- Migration `0014_kofi_donations.sql` 純屬新增：只建立新的 `kofi_*` 資料表、觸發器與索引，絕不重建、修改或刪除任何既有財務資料表（ECPay、Lemon Squeezy、Creem、AI 額度餘額）。
- 先套用於 staging：`npx --no-install wrangler d1 migrations apply pure-link-staging --remote`，再以 `wrangler d1 migrations list pure-link-staging --remote` 確認已套用，並用 `npx --no-install wrangler d1 execute pure-link-staging --remote --command "SELECT name, sql FROM sqlite_master WHERE name LIKE 'kofi_%'"` 檢視資料表與觸發器是否符合預期。
- 正式環境預檢：`npx --no-install wrangler d1 migrations list pure-link-production --remote`（預期僅剩 `0014` 未套用），套用前先備份：`npx --no-install wrangler d1 export pure-link-production --remote --output=backup-before-0014.sql`。D1 Time Travel 另提供 30 天的時間點還原。
- 已套用的 migration 以 `wrangler d1 migrations list pure-link-production --remote` 檢視；webhook 診斷只查識別碼資料列（絕不含負載內容）：`SELECT received_event, message_id, created_at FROM kofi_webhook_events ORDER BY created_at DESC LIMIT 20`。`received_event` 能清楚區分已記錄的 `donation`／`recurring_donation` 收據與被忽略的 `membership`／`shop_order`／`commission` 事件。
- 隨時可以移除 token 停用收錄：`npx wrangler secret delete KOFI_WEBHOOK_TOKEN`。端點隨後一律回 503（fail-closed），其他內容不變；已記錄的收據不受影響。
- 任何程式碼回滚後，一律保留正式環境的 Ko-fi 捐款資料表。它們是實際收到支持的唯一帳本：刪除等於竄改財務紀錄，且 Ko-fi 的重複投遞依賴同一組 UNIQUE 防護（重複保持冪等、衝突保持拒絕）。重新部署會沿用同一批資料表；絕不把刪除真實捐款紀錄當作例行回滚步驟。


### 支持正式環境 QA

- 既有的 ECPay MerchantID、HashKey、HashIV 只能存為 Worker secret；只有在營運人員套用 migration 後，才把 `ECPAY_ENVIRONMENT=production`、`PUBLIC_ORIGIN=https://no-no.uk` 與 `ECPAY_SUPPORT_CHECKOUT_ENABLED=true` 設為一般變數。
- 檢查 `/en/support` 與 `/zh-Hant/support`：預設私人、三種公開選項彼此獨立、建議與自訂金額均受限制，且介面清楚說明沒有任何產品權益。
- 建立一筆低金額 NT$100 支持訂單。確認已簽名的 ECPay 欄位使用支持專屬 ReturnURL、瀏覽器返回 URL、ClientBackURL、精確 NTD 金額與 `ChoosePayment=ALL`。
- 只有在明確授權的 QA 下完成真實付款。確認一筆已驗證回呼只建立一筆支持、NTD 總額／歷程更新、AI 額度餘額不變，且單獨瀏覽器返回不會改變任何資料。
- 重送同一筆已驗證回呼，確認仍只有一筆支持。測試錯誤 MAC、錯誤 MerchantID、錯誤金額、模擬付款、失敗付款與偽造瀏覽器返回；它們都不得記錄支持或影響額度。
- 退款時，先依商家核准的 ECPay 流程完成並驗證退款，再記錄人工對帳，確認支持總額／歷程只減少已驗證的金額。

## Test Mode QA

正式啟用前，請在兩個供應商的 Test Mode 建立三個正式方案，並確認：停用供應商不顯示結帳按鈕；伺服器建立的結帳正確對應每個方案；無效簽名、未知訂單、錯誤商店／商家與金額不符都不會加入額度；重複確認通知只加入一次；Lemon 累積部分退款後全額退款只撤回新增的權益；ECPay 失敗與模擬通知會安全確認收到但不加入額度。同時確認帳號頁保持正確語言，且瀏覽器回到付款結果頁不會改變額度餘額。
