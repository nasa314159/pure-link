# SEO 與 Google Search Console 設定指南

## 生產環境資訊

- **生產網址**：https://no-no.uk
- **Sitemap**：https://no-no.uk/sitemap.xml
- **Robots.txt**：https://no-no.uk/robots.txt

## 已索引的公開頁面

以下頁面會被搜尋引擎索引：

| 頁面 | 網址 |
|------|------|
| 英文首頁 | https://no-no.uk/en/ |
| 中文首頁 | https://no-no.uk/zh-Hant/ |
| 開始使用（英文） | https://no-no.uk/en/start |
| 開始使用（中文） | https://no-no.uk/zh-Hant/start |
| AI 額度（英文） | https://no-no.uk/en/ai-credits |
| AI 額度（中文） | https://no-no.uk/zh-Hant/ai-credits |
| 隱私說明（英文） | https://no-no.uk/en/privacy |
| 隱私說明（中文） | https://no-no.uk/zh-Hant/privacy |
| 服務條款（英文） | https://no-no.uk/en/terms |
| 服務條款（中文） | https://no-no.uk/zh-Hant/terms |
| 透明度（英文） | https://no-no.uk/en/transparency |
| 透明度（中文） | https://no-no.uk/zh-Hant/transparency |
| 退款政策（英文） | https://no-no.uk/en/refund-policy |
| 退款政策（中文） | https://no-no.uk/zh-Hant/refund-policy |
| 支持 PureLink（英文） | https://no-no.uk/en/support |
| 支持 PureLink（中文） | https://no-no.uk/zh-Hant/support |

## 不會被索引的頁面

以下頁面設為 `noindex` 或在 robots.txt 中封鎖，不會出現在搜尋結果中：

- 帳號頁面（`/account`）
- 認證路由（`/auth/*`）
- API 端點（`/api/*`）
- 管理頁面（`/manage/*`）
- 回報頁面（`/report/*`）
- 使用者分享的內容（如 `/*` 和 `/*+`）

## Google Search Console 設定

### 建議流程：網域資源（Domain Property）

建議使用 Google Search Console 的「網域」資源類型驗證 `no-no.uk`：

1. 前往 [Google Search Console](https://search.google.com/search-console)
2. 點擊「新增資源」
3. 選擇「網域」並輸入 `no-no.uk`
4. 完成 DNS TXT 驗證（在 DNS 設定中加入 Google 提供的驗證記錄）

這種方式可以驗證整個網域，不需要在 HTML 中加入 meta 標籤。

### 選用：網址前綴驗證（URL-prefix Property）

如果偏好使用「網址前綴」資源類型，可以透過 HTML meta 標籤驗證：

1. 在 Google Search Console 新增「網址前綴」資源
2. 選擇「HTML 標記」驗證方法
3. 複製 Google 提供的中繼標籤（例如：`<meta name="google-site-verification" content="xxx">`）
4. 透過 Cloudflare Dashboard 或 `wrangler secret put` 將驗證 token 設定為環境變數：

```
GOOGLE_SITE_VERIFICATION=你的驗證token
```

**注意**：`GOOGLE_SITE_VERIFICATION` 的值是公開的中繼標籤內容，不是應用程式密鑰。可以安全地透過 `wrangler secret put` 設定，或在 Cloudflare Dashboard 中設定為環境變數。

### 提交 Sitemap

1. 在 Google Search Console 中選取你的網域資源
2. 前往「Sitemap」
3. 在「新增 Sitemap」欄位輸入 `sitemap.xml`
4. 點擊「提交」

### 請求索引

建議請求索引的代表性頁面：

- https://no-no.uk/en/
- https://no-no.uk/zh-Hant/
- https://no-no.uk/en/start
- https://no-no.uk/zh-Hant/start
- https://no-no.uk/en/ai-credits
- https://no-no.uk/zh-Hant/ai-credits

**請求方式：**

1. 在 Google Search Console 中選取你的網域資源
2. 前往「 URL 檢查」
3. 輸入要請求索引的網址
4. 點擊「請求索引」

### 預期等待時間

索引不是即時的，且無法保證。Google 通常需要數天到數週來處理：
- 首次提交可能需要 1-4 週
- 後續更新通常較快（數天）
- 完全索引取決於 Google 的爬蟲預算和頁面品質評估

## 技術實作細節

### 中繼標籤

每個公開頁面包含：

- `<title>`：獨特且描述性的標題
- `<meta name="description">`：簡潔的頁面描述
- `<meta name="robots">`：設為 `index, follow`（公開頁面）
- `<link rel="canonical">`：標準化網址（使用 `https://no-no.uk`）
- `<link rel="alternate" hreflang="...">`：語言替代連結

### Open Graph 與 Twitter Card

每個頁面包含完整的社群分享中繼資料：

- `og:title`、`og:description`、`og:image`、`og:url`、`og:site_name`
- `twitter:card`、`twitter:title`、`twitter:description`、`twitter:image`

### 結構化資料（JSON-LD）

公開頁面包含 WebSite 結構化資料，採用 schema.org 格式。

### 多語系標記

使用 `hreflang` 標籤正確標記多語系頁面：
- `en` - 英文版
- `zh-Hant` - 繁體中文版
- `x-default` - 預設版（英文）

## 維護備註

- Sitemap 會自動包含所有公開頁面
- 無需手動更新 sitemap.xml
- 使用者分享的內容（短網址、公式、小卡）故意不包含在 Sitemap 中，以避免重複內容問題
