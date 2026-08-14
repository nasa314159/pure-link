# PureLink

**Just share.**<br>
No ads. No needless data.

[使用 PureLink](https://no-no.uk) · [English](../README.md)

PureLink 是一個安靜、簡潔、可被驗證其隱私承諾的分享工具。MVP 把三件事做好：

- **短網址：**接收者可在網址後加上 `+`，先看完整目的地與推薦／分潤揭露。
- **公式：**支援 LaTeX、常見 Unicode 數學輸入、文字混合公式、可自訂的本機快捷鍵、即時預覽、複製原始內容與下載 PNG；登入者可選擇以 Cloudflare Workers AI 將一句描述轉成可編輯 LaTeX 草稿。
- **短文小卡：**一段話、可選署名，以及紙白、薄霧、夜色三種主題。

任何人都能閱讀與建立。Auto 只提出內容類型建議，不會替使用者做不可見的決定。匿名建立者會收到唯一管理地址；PureLink 只保存憑證雜湊，因此遺失後無法找回。自願使用 Google 登入者可跨裝置管理主動連結的內容；匿名管理仍不要求登入。

## 本機執行

需求：Node.js 20+ 與 npm。

```sh
npm install
npx wrangler d1 migrations apply pure-link-production --local
npm run dev
```

第一次建立本機資料庫時，也可用完整結構：

```sh
npx wrangler d1 execute pure-link-production --local --file schema.sql
```

測試與部署前檢查：

```sh
npm test -- --run
npm run assets:prepare
npx wrangler deploy --dry-run
```

`npm run assets:prepare` 會把 KaTeX 字型、樣式與 PNG 匯出程式整理到 `public/assets`。瀏覽器端不依賴 CDN。

## iOS 分享捷徑

第一版不開放能繞過 Turnstile 的匿名直寫 API。iPhone／iPad 捷徑可以從分享表單接收網址，將它做 URL 編碼後開啟：

```text
https://no-no.uk/#url=[捷徑輸入]
```

PureLink 會自動把網址帶入建立頁，使用者仍能檢查目的地、選擇清理規則並親自確認建立。網址放在 `#` 後方，因此開啟頁面時不會先被當成伺服器查詢參數送出。

## 正式環境設定

公開寫入採 fail-closed：缺少下列設定時，建立與檢舉 API 會回覆 503，而不是取消防護。

- `TURNSTILE_SITE_KEY`：可公開的 Turnstile site key。
- `TURNSTILE_SECRET_KEY`：使用 `wrangler secret put` 設定。
- `RATE_LIMIT_SECRET`：至少 32 個隨機位元組，使用 `wrangler secret put` 設定。
- `GOOGLE_CLIENT_ID`：Google OAuth 網頁應用程式用戶端 ID。
- `GOOGLE_CLIENT_SECRET`：使用 `wrangler secret put` 設定。
- Google OAuth 授權重新導向 URI：`https://no-no.uk/auth/google/callback`。
- Workers AI binding：`AI`（已寫入 `wrangler.jsonc`，不需要把 API key 寫進專案）。

請勿把真實密鑰提交到 Git。可複製 `.dev.vars.example` 為 `.dev.vars` 做本機設定。

## Android PureLink 鍵盤

[`android/`](../android/README.zh-Hant.md) 包含一個輕量 Kotlin 輔助輸入法，可處理刻意標記與完整 `no-no.uk` 網址。使用者明確解析目前剪貼簿、選擇安全的 PureLink 候選項目後，就能切回 Samsung Keyboard 或 Gboard；`ACTION_SEND`、`ACTION_PROCESS_TEXT` 與手動解析仍保留為備用入口。解析完全在本機進行；不含預測、剪貼簿歷程、AccessibilityService、分析、廣告或背景監控。只有明確確認建立多連結小卡本文時才使用網路；單一連結直接透過 Android 分享。

## 隱私設計

| 類別 | 保存內容 | 用途／期限 |
| --- | --- | --- |
| 分享內容 | 內容、類型、設定、狀態、時間、管理憑證雜湊 | 提供分享與匿名刪除 |
| 每日統計 | 日期、動作、內容類型、國家代碼、總數 | 成本與使用狀況；沒有原始 IP 或個人歷程 |
| 速率限制 | HMAC 短期代碼、次數、到期時間 | 阻止大量惡意寫入；到期後清除 |
| 檢舉 | 類別、最少補充說明、狀態、時間 | 內容安全審查；不要求姓名或電子郵件 |
| AI 每日額度 | 帳號、日期、當日次數 | 一般帳號每日最多 5 次，維運管理員 100 次；不保存描述或生成結果 |

服務不投放行為廣告、不做跨站追蹤、不販售資料、不建立個人興趣檔案，也不把分享內容用於模型訓練。完整說明在網站的 [`/privacy`](https://no-no.uk/privacy)、[`/terms`](https://no-no.uk/terms) 與 [`/transparency`](https://no-no.uk/transparency)。

## AI 額度與付款邊界

一般登入帳號每日仍有 5 次免費 AI 公式生成。額外額度是一次性數位商品，不是訂閱：US$5／300 次、US$10／800 次、US$20／2,000 次。付款確認後才會自動加入發起結帳的 PureLink 帳號；免費額度先使用，購買額度在 AI 公式服務持續營運期間不過期。

Creem 只處理 AI 公式額度商品，並作為這些交易的 merchant of record；它不處理沒有商品對價的自願支持。自願支持與 AI 額度在介面、帳務和公開說明中保持分離。公開商品與退款說明位於 [`/ai-credits`](https://no-no.uk/ai-credits) 與 [`/refund-policy`](https://no-no.uk/refund-policy)。

## 專案結構

- `src/index.js`：路由與使用情境協調。
- `src/content.js`：三種內容的驗證與正規化。
- `src/repository.js`：D1 資料存取。
- `src/abuse.js`：Turnstile 與隱私友善速率限制。
- `src/analytics.js`：每日聚合統計。
- `src/pages.js`：伺服器產生的公開介面與聲明頁。
- `migrations/`：依序套用的 D1 結構變更。
- `test/`：不需外部服務即可執行的單元與流程測試。

產品邊界與上線清單見 [`docs/PRODUCT.md`](PRODUCT.md) 與 [`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)。

## 開源授權

PureLink 採用 [MIT License](../LICENSE)。它允許任何人檢查、使用、修改與自行部署，條件是保留原始著作權與授權聲明。選擇 MIT 是為了讓個人、學校、社群與小型專案都能低摩擦地享受與延續成果。

---

[Read in English](../README.md)
