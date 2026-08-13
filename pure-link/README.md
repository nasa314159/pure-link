# PureLink

[no-no.uk](https://no-no.uk) · [GitHub](https://github.com/nasa314159/pure-link)

PureLink 是一個安靜、簡潔、可被驗證其隱私承諾的分享工具。MVP 把三件事做好：

- 短網址：接收者可在網址後加上 `+`，先看完整目的地與推薦／分潤揭露。
- 公式：支援 LaTeX、常見 Unicode 數學輸入、文字混合公式、符號面板、即時預覽、複製原始內容與下載 PNG。
- 短文小卡：一段話、可選署名，以及紙白、薄霧、夜色三種主題。

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

## 正式環境設定

公開寫入採 fail-closed：缺少下列設定時，建立與檢舉 API 會回覆 503，而不是取消防護。

- `TURNSTILE_SITE_KEY`：可公開的 Turnstile site key。
- `TURNSTILE_SECRET_KEY`：使用 `wrangler secret put` 設定。
- `RATE_LIMIT_SECRET`：至少 32 個隨機位元組，使用 `wrangler secret put` 設定。
- `GOOGLE_CLIENT_ID`：Google OAuth 網頁應用程式用戶端 ID。
- `GOOGLE_CLIENT_SECRET`：使用 `wrangler secret put` 設定。
- Google OAuth 授權重新導向 URI：`https://no-no.uk/auth/google/callback`。

請勿把真實密鑰提交到 Git。可複製 `.dev.vars.example` 為 `.dev.vars` 做本機設定。

## 隱私設計

PureLink 的應用資料分成四類：

| 類別 | 保存內容 | 用途／期限 |
| --- | --- | --- |
| 分享內容 | 內容、類型、設定、狀態、時間、管理憑證雜湊 | 提供分享與匿名刪除 |
| 每日統計 | 日期、動作、內容類型、國家代碼、總數 | 成本與使用狀況；沒有原始 IP 或個人歷程 |
| 速率限制 | HMAC 短期代碼、次數、到期時間 | 阻止大量惡意寫入；到期後清除 |
| 檢舉 | 類別、最少補充說明、狀態、時間 | 內容安全審查；不要求姓名或電子郵件 |

服務不投放行為廣告、不做跨站追蹤、不販售資料、不建立個人興趣檔案，也不把分享內容用於模型訓練。完整說明在網站的 `/privacy`、`/terms` 與 `/transparency`。

## 專案結構

- `src/index.js`：路由與使用情境協調。
- `src/content.js`：三種內容的驗證與正規化。
- `src/repository.js`：D1 資料存取。
- `src/abuse.js`：Turnstile 與隱私友善速率限制。
- `src/analytics.js`：每日聚合統計。
- `src/pages.js`：伺服器產生的公開介面與聲明頁。
- `migrations/`：依序套用的 D1 結構變更。
- `test/`：不需外部服務即可執行的單元與流程測試。

產品邊界與上線清單見 `docs/PRODUCT.md` 與 `docs/RELEASE_CHECKLIST.md`。

## 開源授權

PureLink 採用 [MIT License](LICENSE)。它允許任何人檢查、使用、修改與自行部署，條件是保留原始著作權與授權聲明。選擇 MIT 是為了讓個人、學校、社群與小型專案都能低摩擦地享受與延續成果。
