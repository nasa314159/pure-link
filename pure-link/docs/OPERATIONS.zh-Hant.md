# 維運手冊

## A. 一般部署流程

```bash
cd /Users/nasa/Developer/pure-link
git switch main
git pull --ff-only origin main
cd pure-link
npm test -- --run
npx --no-install wrangler deploy --dry-run --env=""
npx --no-install wrangler deploy --env=""
```

**重要提醒**：

- **遷移不會自動套用**：D1 資料庫遷移需要手動執行，不會在部署時自動套用
- ** rutin deployment 時請勿變更 secrets**：例行部署不應變更生產環境的 secret 設定
- **遇到未預期的遠端設定差異時，先調查再接受**：如果 `wrangler deploy` 顯示預期外的設定變更，請先確認原因再繼續

## B. 生產 smoke-test 檢查清單

部署後驗證代表性頁面和功能：

| 檢查項目 | 說明 |
| --- | --- |
| `/en/` | 英文首頁正常載入 |
| `/zh-Hant/` | 中文首頁正常載入 |
| `/sitemap.xml` | Sitemap 可存取且格式正確 |
| `/robots.txt` | Robots.txt 包含正確的 sitemap 參照 |
| Google OAuth 登入 | 確認登入流程正常運作 |
| Safari 隱私瀏覽登出 | 確認隱私瀏覽模式下的登出行為正確 |
| 匿名連結建立 | 確認可以在不登入的情況下建立短網址 |
| Turnstile | 確認 Cloudflare 挑戰正常運作（若已啟用） |
| 回報建立 | 提交測試回報，確認流程完成 |
| Discord 通知 | 確認 Discord 通知傳送且內容經過適當處理（若有設定） |
| 帳號頁面 | 確認已登入使用者的帳號頁面正常 |
| ECPay 結帳 | 確認 ECPay 結帳流程可以正常開啟（**不要**在每次部署時真的付款） |

**不要**在每次部署時進行真實付款交易。

## C. ECPay 安全邊界

- **瀏覽器返回僅供參考**：ECPay 結帳後的瀏覽器返回頁面是資訊性質，不會授予任何權限
- **伺服器端驗證回呼是權威來源**：只有來自 ECPay 的已驗證伺服器回呼才能確認付款並授予額度
- **額度數量由伺服器控制**：包數量/額度數量由 PureLink 伺服器決定，不是由 ECPay 返回的資料決定
- **重複回呼不會重複授予**：伺服器實作防重複機制，確保同一筆交易不會被處理兩次
- **ChoosePayment=ALL 保留**：這是故意的設定，讓使用者可以看到所有付款方式
- **TWQR 顯示取決於商店啟用狀態**：使用者是否能看到台灣 QR code 付款方式，取決於商店在 ECPay 的啟用狀態

## D. D1 遷移

PureLink 使用 Cloudflare D1 資料庫。遷移管理方式：

**查看現有遷移**：

```bash
cd pure-link
ls migrations/
```

目前有 11 個遷移檔案（0000 到 0010）。

**在本地環境套用遷移**（如有需要）：

```bash
npx wrangler d1 migrations apply pure-link-staging --local
npx wrangler d1 migrations apply pure-link-production --local
```

**在生產環境套用遷移**（需謹慎）：

```bash
# 先在 staging 測試
npx wrangler d1 migrations apply pure-link-staging
# 確認無誤後再套用到生產
npx wrangler d1 migrations apply pure-link-production
```

**重要原則**：

- 生產遷移是**手動**執行的
- **永遠不要**随意執行或編輯已套用的遷移檔案
- 如果必須復原，請諮詢有經驗的團隊成員

## E. Secrets/設定安全

以下是需要謹慎管理的設定**名稱**。**永遠不要**將實際的 secret 值提交到倉庫或公開在任何文件中。

| Secret 名稱 | 用途 |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 驗證 |
| `RATE_LIMIT_SECRET` | 速率限制 HMAC 金鑰 |
| `GOOGLE_CLIENT_ID` | Google OAuth 用戶端 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 用戶端密鑰 |
| `DISCORD_REPORT_WEBHOOK_URL` | Discord 回報通知 webhook |
| `ECPAY_MERCHANT_ID` | ECPay 商店代號 |
| `ECPAY_HASH_KEY` | ECPay 雜湊金鑰 |
| `ECPAY_HASH_IV` | ECPay 雜湊 IV |
| `ECPAY_ENVIRONMENT` | `stage` 或 `production` |
| `ECPAY_CHECKOUT_ENABLED` | `true` 或 `false` |
| `LEMON_SQUEEZY_API_KEY` | Lemon Squeezy API 金鑰 |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Lemon Squeezy webhook 密鑰 |

**並非**所有這些值都需要作為 secret 處理（例如 `ECPAY_ENVIRONMENT` 和 `ECPAY_CHECKOUT_ENABLED`），但生產設定應謹慎管理。

設定方式：

```bash
# 設定生產 secret
npx wrangler secret put SECRET_NAME

# 透過 Cloudflare Dashboard 設定環境變數
# 前往 Workers & Pages > PureLink > 設定 > 環境變數
```

## F. 復原程序

如果部署後發現問題，請遵循以下保守程序：

**1. 先調查，不要急於復原**

```bash
# 查看目前的部署版本
npx wrangler deployments list
```

**2. 如果需要復原到上一個穩定版本**

```bash
# 復原到前一個部署（使用 deployment ID）
npx wrangler rollback [deployment-id]
```

**3. 檢查 Cloudflare Dashboard**

- 前往 Cloudflare Dashboard > Workers & Pages > PureLink
- 查看即時日誌和錯誤
- 確認綁定的資源（D1、AI、ASSETS）是否正確

**4. 如果問題與 D1 有關**

- 確認遷移已正確套用
- 檢查 D1 資料庫狀態

**5. 復原後驗證**

部署後請重新執行 smoke-test 檢查清單，確認問題已解決。

## G. 相關檔案

- [ECPay 說明文件](BILLING.zh-Hant.md)
- [Discord Webhook 說明](DISCORD_WEBHOOK.zh-Hant.md)
- [隱私權政策](../zh-Hant/privacy) - 另有英文版
- [服務條款](../zh-Hant/terms) - 另有英文版
