# Issue 11 - Response Text 改為去除 HTML Tag 的純文字

## Status

完成。

本檔記錄 `responseText` 去 HTML tag、驗證結果與 FEEDBACK。

## Task A - 調整 responseText 萃取規則

- Goal: 將 HTML response 轉成純文字而不是原始標記。
- Method:
  - 在 `prepare-rounds.mjs` 新增 `looksLikeHtmlText()`，先判斷 response body 是否屬於 HTML/XML 類型。
  - 新增 `extractPlainTextFromHtml()`，移除 comment、script、style、noscript 與一般 HTML tag。
  - 對常見 block 結尾標籤保留換行，避免所有內容被擠成一行。
  - `responseText` 仍沿用既有的 entity decode 與 truncate 邏輯。
- Evidence:
  - `npm run timeline:prepare`
  - `source/round1/viewer/timeline.json`
  - `apps/timeline-viewer/public/generated/round1/timeline.json`
  - `node` 檢查結果顯示 `responseText` 已為純文字，例如：
    - `全球金融網`
    - `兆豐商業銀行 OSIB`
- Decision: feasible

### FEEDBACK
- Positive: 在 prepare 階段先把 HTML 轉成純文字後，前端完全不需要知道如何去 tag，`Response Text` 的定義也更清楚。
- Negative: 目前是以字串規則處理，不是完整 HTML parser；對極端不規則 HTML，純文字結果仍可能不完美。
- Evidence: `looksLikeHtmlText()`、`extractPlainTextFromHtml()`、重建後 round1 的 `responseText` 內容。
- Next Run: 若之後碰到更多複雜 HTML，可再針對 `table`、`option`、`label/value` 類型補更細的換行或分隔規則。

## Task B - 文件與 issue 同步

- Goal: 讓下一輪知道 `Response Text` 的定義已更新。
- Method:
  - 更新 root `README.md`，補上 `Response Text` 會盡量去除 HTML tag。
  - 更新 `apps/timeline-viewer/README.md`，將 `Response Text` 說明改為解碼、去 tag、截斷後的純文字。
  - 新增 `issue/issue-11/plan.md` 與回填本檔。
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-11/plan.md`
  - `issue/issue-11/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 文件已把 `Response Text` 的語意講清楚，下一輪不會再誤解成「只是原始 body 的另一個 view」。
- Negative: README 目前仍只寫摘要；若後續文本萃取規則再增加，可能需要獨立整理 extraction rules。
- Evidence: README 與 app README 的文字更新。
- Next Run: 若之後再增加更多純文字整理規則，可在文件補一小段 examples，讓預期輸出更明確。

## Task C - 驗證與紀錄

- Goal: 確認修改後 prepare / build 正常。
- Method:
  - 執行 `npm run timeline:build` 驗證前端仍可編譯。
  - 執行 `npm run timeline:prepare` 驗證新的 `responseText` 可被重建進 round1 輸出。
  - 用 `node` 直接檢查重建後的 `responseText` 是否仍殘留大段 HTML tag。
- Evidence:
  - `npm run timeline:build`
  - build 成功
  - `npm run timeline:prepare`
  - round1 實跑結果：
    - `Prepared round1: 82 slices / 146 HAR / 357 recording`
  - `node` 檢查輸出顯示 `responseText` 已為純文字內容
- Decision: feasible

### FEEDBACK
- Positive: build 與 prepare 都過，代表這次只改 prepare 的文字規則，沒有破壞既有 tabs UI。
- Negative: 這輪還沒有逐一人工抽查所有 HTML 類型 response，因此目前證據以 round1 樣本與程式規則為主。
- Evidence: `timeline:build` 成功、`timeline:prepare` 成功、`responseText` 抽樣結果。
- Next Run: 開 viewer 實際點幾筆不同型態的 HAR，特別確認 login page、table page、select option page 的純文字可讀性。
