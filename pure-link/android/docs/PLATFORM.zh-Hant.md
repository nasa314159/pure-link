# Android 平台說明與實機 QA

[English](PLATFORM.md)

## 輸入法架構

`PureLinkInputMethodService` 以 Android `InputMethodService` 註冊，包含必要的 `android.permission.BIND_INPUT_METHOD`、`android.view.InputMethod` intent filter 與 `res/xml/method.xml` metadata。啟用與選擇完全由 Android 設定和輸入法挑選器控制；沒有 Samsung 或 Gboard 專用 API。

這是輔助解析鍵盤，不讀取周圍編輯器文字、不產生預測、不學習輸入，也不監看剪貼簿。它開啟時會顯示並聚焦內部的手動短代號欄位；按鍵只會輸入此欄位，絕不寫入後方宿主編輯器。深色五列版面只提供 `[A-Za-z0-9_-]`：數字、QWERTY、ASDF、Shift／ZXCVBNM／退格、Globe／`_`／`-`／Enter。Shift 有小寫、一次 Shift、雙擊 Caps Lock 三種狀態，且只有英文字母會消耗一次 Shift。頂部工具列只保留剪貼簿、分享、帳號；Globe 只留在底部鍵盤列。帳號只會開啟相符語系的網頁帳號／登入入口。它只會在使用者按下「剪貼簿」後讀取目前的文字剪貼簿；敏感欄位只依 `EditorInfo` metadata 清除暫存工作階段，不會讀取欄位內容。`ACTION_SEND` 與 `ACTION_PROCESS_TEXT` 都是標記／完整網址限定的輸入路徑；後者讀取 `Intent.EXTRA_PROCESS_TEXT`、回傳 `RESULT_CANCELED`，不回傳替換文字。

候選管理列先放有無障礙標籤的圖示式**刪除已選候選項目**，再放全選與 `+ 全部`，其餘列寬刻意留白。它只刪除已選列，保留未選列的來源順序與 `+` 狀態；只要還有候選也會保留說明。刪除最後一個候選才回到手動模式。緊湊的說明欄是 PureLink 自有的多行 `EditText`；編輯圖示、欄位與貼上按鈕只會在 PureLink 內啟用編輯，不會切換輸入法或開啟 Activity。PureLink 自有按鍵會直接編輯說明，貼上仍支援繁體中文、日文、emoji 與多行 Unicode，並使用既有 280 code points 限制。

## 網路與驗證邊界

單一連結只在本機格式化並分享，不會連線。`INTERNET` 是一般 Android manifest 權限，不需要 runtime 提示。兩個以上連結建立小卡時，IME 會開啟短暫 `NativeVerificationActivity`，其 WebView 只能載入 `https://no-no.uk/native/verify?locale=en|zh-Hant`、固定的 PureLink 驗證 API 路徑與 HTTPS `challenges.cloudflare.com` Turnstile 資源。JavaScript 和 DOM storage 僅因 Turnstile 所需而啟用；使用預設 WebView user agent，不提供 JavaScript bridge，且不把剪貼簿或小卡本文交給 WebView。

驗證頁只把原始 Turnstile response 送往 `/api/native/challenge/complete`。Worker 會在伺服器端確認 success、主機 `no-no.uk` 與動作 `native-card-create`，接著建立兩分鐘有效的一次性不透明憑證。D1 只保存該憑證的 SHA-256 雜湊、到期時間與使用時間。驗證頁只以 `purelink-native://verified?token=…` 回傳 43 字元 base64url 憑證；Activity 驗證後用同一個行程的 `ResultReceiver` 傳回 IME，並銷毀 WebView；原始 Turnstile token 不會到達 IME。部署必須包含此頁、兩個原生 API route、原生憑證 D1 migration 與設定好的 Turnstile 動作；否則多連結小卡無法完成，並必須保留本機工作階段供重試。

之後才會以 `HttpsURLConnection` 將下列資料送往固定 `https://no-no.uk/api/native/cards`：

```json
{ "content": "使用者最後確認的小卡本文", "nativeCreateToken": "短效不透明憑證" }
```

端點拒絕多餘欄位、強制建立小卡，以 D1 `UPDATE … WHERE used_at IS NULL AND expires_at > ? RETURNING` 原子消耗憑證，最多建立一張小卡，只回傳公開網址。若後續插入失敗，憑證仍保持已使用，以防重放。它不接收／回傳原始剪貼簿、周圍編輯器文字、目的地網址、公式原始碼、既有小卡、分析資料或管理憑證。

驗證取消或失敗、網路失敗與小卡建立失敗都會保留候選、選擇、`+` 狀態與說明。generation gate 會在新解析或 IME 工作階段結束後丟棄舊非同步結果。範圍很小的「PureLink 自有短暫 Activity」狀態可避免把 `NativeVerificationActivity` 誤判成真正的 `onFinishInputView()` 結束；不相關的一般結束仍會完成 gate。目前 production 的 `/native/verify` 回傳 HTTP 404，Activity 會顯示服務暫時無法使用，而不會誤導為使用者驗證失敗。Android 無法從「已開啟分享選單」可靠證明訊息已送達，因此工作階段會保留至 IME 正常結束。

## 實機 QA

1. 安裝 debug APK，從設定 Activity 啟用 PureLink 鍵盤，並用 Android 輸入法挑選器切換。
2. 在一般編輯欄位確認手動短代號欄可見、已聚焦，輸入 `A3cd8` 不會改變宿主編輯器。確認深色鍵盤只有數字、QWERTY、ASDF、Shift／ZXCVBNM／退格、Globe／`_`／`-`／Enter；在 360dp、412dp、480dp 與旋轉時都不需橫向捲動。
3. 按一次 Shift 後輸入 `_`、`7`、英文字母，確認只有字母消耗一次 Shift；雙擊 Shift 進入 Caps Lock，再按一次回到小寫。手動解析 `A3cd8`，確認 Open 不改變分享的 `+` 狀態，Preview 只開啟 `https://no-no.uk/A3cd8+`；獨立 `[+]` 控制才改變最後分享網址。
4. 以三個帶標記候選測試全選、取消一列、`+ 全部`；只改變選取列。
5. 使用說明欄旁的貼上按鈕貼入中文、日文與 emoji，確認最多 280 Unicode code points，且不改變候選。
6. 單一連結分享時確認沒有網路／Turnstile；說明、標籤與網址的間距正確，分享選單後工作階段仍存在。
7. 多連結分享時確認短暫驗證窗只顯示 PureLink／Turnstile，成功後自動關閉，只分享回傳的小卡公開網址；取消或失敗後可重試且狀態保留。
8. 確認帳號圖示只在瀏覽器開啟 `/en/account` 或 `/zh-Hant/account`，不建立原生登入狀態。測試 `ACTION_SEND`、`ACTION_PROCESS_TEXT`、密碼欄位、無瀏覽器裝置、英文與繁體中文、旋轉、TalkBack 與無網路情境。
