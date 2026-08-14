# PureLink 上線清單

[English](RELEASE_CHECKLIST.en.md)

## A. 本地 MVP

- [x] 保留舊版本快照並在獨立分支開發。
- [x] 重整資料模型、輸入驗證、匿名管理與安全標頭。
- [x] 完成網址建立、302 跳轉與 `+` 預覽。
- [x] 完成公式混合排版、原始碼複製與 PNG。
- [x] 完成短文小卡、署名、三主題與 PNG。
- [x] Auto 僅建議，不暗中覆寫使用者選擇。
- [x] 完成寫入防濫用、內容檢舉與最低限度聚合統計。
- [x] 完成隱私、內容規範與透明度頁。
- [x] 建立單元與主要流程測試。

## B. 上線前必須由維護者完成

- [x] 選定並註冊正式網域 `no-no.uk`。
- [x] 建立 Managed Turnstile widget，允許 `no-no.uk` 與 `staging.no-no.uk`。
- [x] 產生獨立的 `RATE_LIMIT_SECRET`，不得沿用其他服務密鑰。
- [ ] 在遠端 D1 先備份，再依序套用所有尚未套用的 migration（目前至 `0006`）。
- [x] 建立與正式環境隔離的 `pure-link-staging` D1。
- [x] 在 staging 驗證建立、預覽、跳轉、公式、小卡、PNG、檢舉與刪除。
- [ ] 驗證手機、鍵盤操作、錯誤畫面與 Turnstile 無障礙流程。
- [ ] 確認 Cloudflare 日誌／觀測設定、可存取人員與保存期限符合公開隱私說明。
- [ ] 建立檢舉處理者、檢視頻率與緊急下架流程。
- [x] 選定 MIT 開源授權並加入 `LICENSE`。
- [ ] 補上公開原始碼、製作歷程與安靜的自願支持連結。
- [ ] 在 Creem 測試模式建立 300 次額度商品，設定測試 API key 與 webhook secret。
- [ ] 將 Creem 測試 webhook 指向 `/api/webhooks/creem`，驗證付款、重送、退款與爭議事件。
- [ ] Creem 商家審核通過後，再設定正式 API key、正式 webhook secret，並啟用正式結帳。
- [ ] 確認 Creem 顯示 Live payments enabled 後，才將 `CREEM_LIVE_CHECKOUT_ENABLED` 設為 `true`。

## C. 發布順序

1. 建立 staging 資源與秘密設定。
2. 套用遠端資料庫 migration。
3. 部署 staging 並完成完整驗收。
4. 檢查隱私聲明與實際供應商設定一致。
5. 建立正式備份與回復方式。
6. 部署正式環境，做短時間 smoke test。
7. 才對外公開網址與原始碼。

若任何寫入防護秘密缺失，服務應維持讀取可用、公開寫入回覆 503；不要為了趕上線而繞過保護。
