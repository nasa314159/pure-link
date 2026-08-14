# PureLink Android 工具

[English](README.md)

PureLink Android 工具可把刻意寫下的短代號轉成既有的 PureLink 網址，不需要帳號、API 請求或更換鍵盤。

```text
PureLink: A3cd8
Link: Q9xK2
🔗: H72Ld
```

當訊息或留言含有短代號，但來源 App 不讓人選取需要的文字部分時，這個工具特別有用。

## 功能

- 來源 App 支援時，透過 Android `ACTION_PROCESS_TEXT`（Android 6.0／API 23+）處理已選取文字。
- 透過 `ACTION_SEND` 處理分享至本工具的文字。
- 提供快速手動解析器，可輸入裸短代號、帶標記的代號或一大段貼上的文字。
- 提供靜態啟動器捷徑「解析 PureLink」，可直接開啟手動解析器。
- 一筆結果直接顯示；多筆結果依原文順序顯示精簡選擇器。
- 使用者的正常網址處理程式會開啟 `https://no-no.uk/<slug>`，或預覽 `https://no-no.uk/<slug>+`。

本工具不改變 PureLink 網站語意：只有預覽動作才會把 `+` 加在通過驗證的 slug 最後。

## 解析規則

解析器使用網站目前的自訂 slug 字元規則：1–30 個 ASCII 英文字母、數字、`_` 或 `-`；也會排除 `en`、`account` 等網站保留路徑。

在分享或已選取文字中，必須有刻意的標記，避免把一般英數文字誤當成連結：

- `PureLink:` 與 `Pure Link:`（不分大小寫）
- `Link:`（不分大小寫）
- `🔗:` 或 `🔗`

支援全形 `：`、全形空白和前後空白。手動輸入時，額外支援單獨合法的裸 slug，例如 `A3cd8`；分享或選取後傳入的文字則一律需要刻意標記，因此一般單字或裸 slug 不會被意外開啟。`論文 PureLink: A3cd8` 中的「論文」只在本機介面作為顯示提示，不會改變 slug 或產生的網址。

## 隱私與安全

- 解析與候選選擇完全在裝置本機完成。
- App **不宣告任何 Android 權限**，包括 `INTERNET`、剪貼簿歷程、儲存空間、AccessibilityService 或背景服務權限。
- 不含分析、廣告、第三方 crash telemetry 或網路用戶端函式庫。
- 選取／分享的文字會解析後立即從輸入框清除；目前畫面只保留候選項目的本機標籤與 slug。`ACTION_PROCESS_TEXT` 會明確回傳 `RESULT_CANCELED`，且不回傳替換用的 `EXTRA_PROCESS_TEXT`，因此絕不修改來源 App 的選取文字，也不會存進偏好設定、資料庫或剪貼簿歷程。
- 解析器只用驗證過的 slug 建立 `no-no.uk` 的 HTTPS 網址，會拒絕 scheme、主機／路徑注入、編碼或一般斜線、控制字元、過長代號，以及分享文字中的普通字詞。

開啟候選項目時會交給使用者的瀏覽器或已設定處理程式。App 本身不讀取 PureLink，也不會把周圍訊息文字傳到 PureLink。

## 建置與測試

以 Android Studio 開啟 `android/`，使用 Android SDK Platform 35 與 JDK 17；或使用相容的本機 Gradle：

```sh
cd android
./gradlew :core:test :app:assembleDebug
```

`core` 不依賴 Android，包含解析器／網址建構與 JUnit 測試。`app` 只使用 Kotlin 與 Android 平台 View API，不含第三方 UI 或網路函式庫。

## 平台界線

正式 App **不會**在 Samsung Keyboard、Gboard 或其他第三方 IME 裡插入候選列。Android 的 candidate view 只屬於目前啟用的自有 `InputMethodService`；要這樣做會要求使用者換成 PureLink 鍵盤，這不是本 MVP 的取捨。

本 App 也沒有 AccessibilityService。此服務必須由使用者明確啟用，並要求敏感的作用中視窗內容讀取能力；對一個解析器來說不成比例，還可能接觸無關畫面文字。遇到不可選取的內容時，手動解析器是較保護隱私的做法。

API 可行性、未來可選 IME prototype 界線與 Samsung/Gboard 手動 QA，請見[平台說明](docs/PLATFORM.md)。
