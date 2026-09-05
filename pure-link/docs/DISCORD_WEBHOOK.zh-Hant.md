# Discord 回報 Webhook 通知

[English](DISCORD_WEBHOOK.en.md)

PureLink 可以在收到內容回報時，選擇性地傳送 Discord webhook 通知。本文件說明設定方式、行為以及隱私限制。

## 概覽

- **D1 是權威儲存**：所有回報都會儲存在 D1。Discord 只是盡力的通知管道。
- **失敗隔離**：Discord 服務中斷、webhook 失敗或網路錯誤都不會導致回報提交失敗。
- **隱私保護**：通知只包含經過處理的審核摘要。敏感欄位會被明確排除。

## 必要環境變數

```text
DISCORD_REPORT_WEBHOOK_URL=https://discord.com/api/webhooks/你的webhook-id/你的webhook-token
```

請勿將真實的 webhook URL 提交到倉庫。生產環境請使用 Worker secret 儲存：

```bash
npx wrangler secret put DISCORD_REPORT_WEBHOOK_URL
```

## 通知內容

當回報成功儲存至 D1 後，會傳送包含以下嵌入內容的 Discord webhook：

| 欄位 | 說明 |
| --- | --- |
| 回報 ID | 唯一識別碼（Base58） |
| 類別 | 釣魚、惡意程式、冒用、著作權、隱私或其他 |
| PureLink | 被回報的短網址後綴 |
| 建立時間 | 伺服器端 UTC 時間戳記 |
| 摘要 | 經過處理且截斷的回報詳細說明（最多 300 字） |

## 隱私限制

Discord 通知明確排除以下內容：

- 密碼、認證 token、工作階段 token
- OAuth 憑證（Google 等）
- 完整卡片或付款資料
- IP 位址（僅儲存 HMAC 衍生的速率限制金鑰）
- 電子郵件地址（若出現在回報詳細說明中會被遮蔽）
- Webhook 密鑰或 API 金鑰
- 復原或管理憑證
- 敏感標頭或 cookie

回報詳細說明在傳送前會經過處理：

1. 移除控制字元
2. 中和 `@everyone` 和 `@here` 提及
3. 移除角色和使用者提及的觸發前綴
4. 遮蔽自由格式文字中的電子郵件地址
5. 自由格式詳細說明截斷至 300 字元

## Webhook 行為

- **非同步傳送**：通知透過 `context.waitUntil()` 在 HTTP 回應傳送後才發出
- **5 秒逾時**：Webhook 要求會在 5 秒後逾時，以避免阻擋
- **不回應重試**：失敗的 webhook 會在伺服器端記錄，但不會重試
- **allowed_mentions**：Discord `allowed_mentions.parse: []` 可防止意外通知

## 停用或輪換 Webhook

1. 從環境中移除或清空 `DISCORD_REPORT_WEBHOOK_URL`
2. 輪換時，將值替換為 Discord 頻道設定中的新 webhook URL
3. 一旦環境變數更新，舊的 webhook 就會自動停止接收通知

## 安全注意事項

- 只有設定的 webhook URL 會接收通知
- 不會建立使用者控制的任意輸出 URL 或 fetch 原語
- Webhook URL 不會被記錄；錯誤只會記錄安全的中繼資料（回報 ID 和錯誤名稱）
- Discord `allowed_mentions` 設為 `parse: []` 以防止濫用提及
- Webhook URL 必須是 discord.com、ptb.discord.com 或 canary.discord.com 上的有效 Discord webhook URL

## 安全 smoke test

在生產環境中執行安全的 webhook smoke test：

1. 先建立或使用一個無害的測試 PureLink（例如建立一個測試連結或卡片）
2. 開啟 `/zh-Hant/report/<測試-slug>` 或 `/en/report/<測試-slug>`（使用真實存在的測試 slug）
3. 選擇「其他」類別
4. 在詳細說明中輸入測試文字（不要包含任何真實資料）
5. 提交回報
6. 確認 D1 中回報成功，且 Discord 頻道中收到通知且內容經過適當處理

**千萬不要**在回報詳細說明中輸入：
- 帳號密碼
- API 金鑰或 OAuth 憑證
- 付款卡片號碼
- 復原或管理憑證
- 真實的個人資料
