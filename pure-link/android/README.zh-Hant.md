# PureLink Android 鍵盤

[English](README.md)

PureLink 是用來解析刻意分享的 PureLink 參照的輕量**輔助 Android 輸入法**。它不是 Samsung Keyboard、Gboard 或完整中英文鍵盤的替代品。

## 建議使用流程

1. 複製包含標記 PureLink 參照或完整 `https://no-no.uk/<slug>` 網址的文字。
2. 將輸入法切換為 **PureLink 鍵盤**。
3. 按唯一的 **剪貼簿** 按鈕。PureLink 只讀取目前的文字剪貼簿，在本機解析，絕不把原始剪貼簿內容插入目前編輯器。
4. 選擇偵測到的連結，並可選擇是否使用 `+ 預覽`。
5. 可選填一次性說明（約最多 280 個 Unicode 字元）。
6. 按 **分享**：
   - 選擇一個連結：直接透過 Android 分享選單分享一般文字；
   - 選擇兩個以上：建立一張 PureLink 小卡，只分享該小卡的公開網址。
7. 可隨時用鍵盤切換按鈕立即切回 Samsung Keyboard 或 Gboard。

設定 Activity 會顯示鍵盤是否已啟用，能開啟 Android 輸入法設定與輸入法挑選器，並保留手動解析及 `ACTION_SEND`／`ACTION_PROCESS_TEXT` 備用入口。

## 鍵盤包含的功能

- 緊湊的 A–Z/a–z、0–9、`_`、`-` 按鍵，另有 Shift、退格與 Enter。
- 唯一一個明確的「剪貼簿／解析」動作，沒有另一個「貼上」按鈕。
- 保持來源順序的候選列；多個候選時提供全選與 `+ 全部`。
- 只建立 `https://no-no.uk/<slug>` 和 `https://no-no.uk/<slug>+` 的開啟／預覽動作。
- Android 系統分享選單與鍵盤切換按鈕。

它刻意不提供語言組字、預測、自動更正、學習詞彙、建議、浮動覆蓋層、AccessibilityService、背景服務、分析、廣告或剪貼簿歷程。

## 解析規則

解析器與網站自訂 slug 規則相同：1–30 個 ASCII 英文字母、數字、`_`、`-`，並排除 `en`、`zh-Hant`、`account` 等網站保留路徑。

剪貼簿、`ACTION_SEND` 與 `ACTION_PROCESS_TEXT` 必須包含刻意標記或完整 PureLink 網址：

```text
PureLink: A3cd8
Pure Link: A3cd8
Link: Q9xK2
🔗: H72Ld
https://no-no.uk/A3cd8
https://no-no.uk/A3cd8+
```

標記不分大小寫，支援半形／全形冒號、全形空白、前後空白、多個候選項目及短的本機前文標籤；完整網址可嵌在周圍文字中。`http`、仿冒主機、額外路徑、編碼斜線、無效字元、過長 slug 與保留路徑都會被拒絕。

只有鍵盤或設定 Activity 的直接手動輸入，可以解析單獨合法裸 slug，例如 `A3cd8`。剪貼簿及外部傳入文字絕不把一般單字或裸 slug 視為候選項目。

## 分享與隱私

選擇一個候選時，PureLink 只分享選填說明、本機標籤與安全公開網址，區塊之間以空白行分隔；不會建立小卡。

選擇兩個以上時，App 只會把使用者最後確認的小卡本文傳給既有匿名小卡端點 `https://no-no.uk/api/links`。本文依來源順序只包含選填說明、選取項目的本機標籤與公開 PureLink 網址；不包含目的地網址、公式原始碼、小卡內容、原始剪貼簿文字或管理憑證。App 最後只分享回傳的小卡公開網址。建立失敗時，當前工作階段的選擇與說明會保留，可重試。

因此只在明確建立多連結小卡時才宣告並使用網路權限；沒有自動查詢或背景請求。既有伺服器端防濫用與速率限制仍是唯一依據，鍵盤不會繞過它們。

目前公開建立端點要求與網站建立相同的 Turnstile 證明。這個原生用戶端刻意沒有繞過方式或內嵌的替代驗證，因此正式環境需要另行設定同樣具保護力的行動 Turnstile／裝置證明交接，才能讓多連結小卡建立完整成功。本機解析與單一連結分享不受影響；建立遭拒時，工作階段仍會保留供重試。

原始剪貼簿文字在解析後即丟棄。App 只在暫時工作階段保留候選項目、選取／預覽狀態、當前說明，以及（若分享選單要重試）短暫回傳的小卡公開網址；不會持久保存剪貼簿、說明、候選、管理憑證或歷程。說明不會另外儲存；成功多連結分享時，它只會成為使用者建立的小卡本文的一部分。

`ACTION_PROCESS_TEXT` 讀取 `Intent.EXTRA_PROCESS_TEXT`、回傳 `RESULT_CANCELED`，且不提供替換文字，因此不會改動來源 App 的選取文字。是否能使用取決於來源 App 的文字選取介面。

## 建置與測試

使用 Android SDK Platform 35 與 JDK 17 在 Android Studio 開啟 `android/`，或執行：

```sh
cd android
./gradlew :core:test :app:assembleDebug
```

`core` 包含解析器、選擇模型與分享格式化的 JVM 測試。`app` 包含 InputMethodService 與設定 Activity，只使用 Kotlin 與 Android 平台 API，不含第三方 UI、分析或網路函式庫。

請參考[平台說明](docs/PLATFORM.md)了解註冊細節與實機 QA。
