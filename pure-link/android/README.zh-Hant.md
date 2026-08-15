# PureLink Android 鍵盤

[English](README.md)

PureLink 是用來解析刻意分享的 PureLink 參照的輕量**輔助 Android 輸入法**。它不是 Samsung Keyboard、Gboard 或完整中英文鍵盤的替代品。

## 建議使用流程

1. 複製包含標記 PureLink 參照或完整 `https://no-no.uk/<slug>` 網址的文字。
2. 將輸入法切換為 **PureLink 鍵盤**。
3. 可見且已聚焦的**手動短代號**欄位會立刻就緒。可直接輸入合法裸 slug，或按**剪貼簿**只讀取目前的文字剪貼簿並在本機解析；PureLink 絕不把這兩種內容插入鍵盤後方的編輯器。
4. 選擇偵測到的連結，並可選擇是否使用 `+ 預覽`。
5. 可選填一次性說明（約最多 280 個 Unicode 字元）。
6. 按 **分享**：
   - 選擇一個連結：直接透過 Android 分享選單分享一般文字；
   - 選擇兩個以上：短暫開啟 PureLink Turnstile 驗證視窗，驗證後建立一張 PureLink 小卡，只分享該小卡的公開網址。
7. 可隨時用鍵盤切換按鈕立即切回 Samsung Keyboard 或 Gboard。

設定 Activity 會顯示鍵盤是否已啟用，能開啟 Android 輸入法設定與輸入法挑選器，並保留手動解析及 `ACTION_SEND`／`ACTION_PROCESS_TEXT` 備用入口。

## 鍵盤包含的功能

- 深色、類 Samsung/Gboard 的緊湊 A–Z/a–z、0–9、`_`、`-` 版面：數字列、QWERTY 列、Shift／退格，以及 Globe／`_`／`-`／Enter。在 360dp、412dp、480dp 寬度都不需橫向捲動。
- 小寫、一次 Shift 與雙擊 Caps Lock；一次 Shift 只會被下一個英文字母消耗。
- 剪貼簿、手動、Globe、分享、帳號都提供直接圖示操作。帳號只會在瀏覽器開啟相符語系的 PureLink 帳號頁，不會建立原生帳號狀態。
- 明確的「剪貼簿／解析」動作，以及只貼入說明欄的獨立貼上按鈕；它不會把說明文字解析成候選項目。
- 保持來源順序的候選列；多個候選時提供全選與 `+ 全部`。
- 只建立 `https://no-no.uk/<slug>` 和 `https://no-no.uk/<slug>+` 的開啟／預覽動作。
- Android 系統分享選單、明確的「清除」控制與鍵盤切換按鈕。

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

選擇一個候選時，PureLink 只分享選填說明、本機標籤與安全公開網址；不會建立小卡，也不會連線到 PureLink。標籤與網址相鄰兩行；說明與項目之間只有一個空白行。

選擇兩個以上時，按下**分享**會在精簡的 WebView 開啟固定 `https://no-no.uk/native/verify`。JavaScript 與 DOM storage 只為 Cloudflare Turnstile 啟用；只允許固定 PureLink 驗證／API 路徑與 `challenges.cloudflare.com`，不提供 JavaScript 介面。WebView 不會收到剪貼簿文字或小卡本文。伺服器確認 Turnstile 的 `no-no.uk` 主機與專用 `native-card-create` 動作後，PureLink 只會透過嚴格的 `purelink-native://verified?token=…` callback 回傳 2 分鐘、一次性、不透明的原生小卡憑證。Android 驗證 callback 後，才將使用者最後確認的小卡本文與該憑證送至 `https://no-no.uk/api/native/cards`。

原生端點只接受小卡內容與單次憑證，不能建立網址或公式、設定自訂 slug／選項，也不會回傳管理憑證。伺服器只保存不可逆憑證雜湊、到期時間與已使用狀態，並機會性清除過期列；先以原子操作消耗憑證後才建立小卡，只回傳公開小卡網址。若後續插入小卡失敗，已驗證的憑證仍會刻意失效，以避免重放。小卡本文依來源順序只包含選填說明、選取項目的本機標籤與公開 PureLink 網址；不包含目的地網址、公式原始碼、既有小卡內容、原始剪貼簿文字或管理憑證。

取消／失敗驗證、無網路或建立小卡失敗時，選擇、`+` 狀態與說明都會保留供重試。新的解析或 IME 工作階段結束後，非同步驗證／小卡結果會被丟棄，不會再開啟分享選單。只在明確建立多連結小卡時才使用網路；沒有自動查詢或背景請求；`INTERNET` 是一般 manifest 權限，永遠不會顯示 runtime 提示；既有伺服器端防濫用與速率限制仍是唯一依據。

已部署的 Worker 必須包含原生驗證頁、`/api/native/challenge/complete`、`/api/native/cards`、原生憑證 D1 migration，以及 `native-card-create` 動作的 Turnstile 設定。若缺少已部署的路由或設定，多連結分享會在驗證嘗試後正確失敗；本機解析與單一連結分享仍可使用。

Android 開啟系統分享選單，不代表接收者已接受或送出訊息。PureLink 因此會保留工作階段（包括回傳的小卡網址），直到使用者明確按「清除」或 IME 工作階段結束。

原始剪貼簿文字在解析後即丟棄。App 只在暫時工作階段保留候選項目、選取／預覽狀態、當前說明，以及（若分享選單要重試）短暫回傳的小卡公開網址；不會持久保存剪貼簿、說明、候選、管理憑證或歷程。說明不會另外儲存；成功多連結分享時，它只會成為使用者建立的小卡本文的一部分。

`ACTION_PROCESS_TEXT` 讀取 `Intent.EXTRA_PROCESS_TEXT`、回傳 `RESULT_CANCELED`，且不提供替換文字，因此不會改動來源 App 的選取文字。是否能使用取決於來源 App 的文字選取介面。

## 建置與測試

使用 Android SDK Platform 35 與 JDK 17 在 Android Studio 開啟 `android/`，或執行：

```sh
cd android
./gradlew :core:test :app:testDebugUnitTest :app:assembleDebug
```

`core` 包含解析器、選擇模型與分享格式化的 JVM 測試。`app` 包含 InputMethodService 與設定 Activity，只使用 Kotlin 與 Android 平台 API，不含第三方 UI、分析或網路函式庫。

請參考[平台說明](docs/PLATFORM.zh-Hant.md)了解註冊細節與實機 QA。
