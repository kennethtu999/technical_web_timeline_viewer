# Issue 11 - Response Text 改為去除 HTML Tag 的純文字

本 issue 承接目前 HAR detail 已有 `Response Text` tab 的 viewer，聚焦把 `responseText` 從「解碼後的 response body」再往前推成「去除 HTML tag 後的可讀純文字」，讓使用者直接看到接近頁面顯示內容的文本。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 `Response Text` 已能優先顯示 response body，但仍保留大量 HTML 結構，例如：

- `<html>`
- `<table>`
- `<option>`
- `<div>`

這代表雖然比 `Response` 摘要更聚焦，但在實際閱讀上仍偏向原始碼，而不是純文字結果。

## 2. 目標

本 issue 要回答：

1. `responseText` 是否能在 prepare 階段去除 HTML tag。
2. 去標籤後是否仍能保留合理的換行與可讀性。
3. `timeline:build` 與 `timeline:prepare` 是否仍可正常完成。

## 3. 執行項目

### Task A. 調整 responseText 萃取規則

- Goal: 將 HTML response 轉成純文字而不是原始標記。
- 預期輸出：
  - `responseText` 去除 HTML tag
  - 保留基本換行
  - entity decode 仍可套用

### Task B. 文件與 issue 同步

- Goal: 讓下一輪知道 `Response Text` 的定義已更新。
- 預期輸出：
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-11/impl.md`

### Task C. 驗證與紀錄

- Goal: 確認修改後 prepare / build 正常。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - issue FEEDBACK 完整回填

## 4. 成功標準

本 issue 若要算成功，至少需滿足：

1. `Response Text` 不再顯示 HTML tag。
2. option / table / 段落等內容仍能以合理純文字方式保留。
3. `timeline:build` 與 `timeline:prepare` 成功。

## 5. 風險

- 純 regex 去 tag 不會是完整 HTML parser，對極端 malformed HTML 可能仍有限制。
- script/style 等內容若未額外排除，可能污染結果。
- 去標籤後若過度壓縮空白，可能讓表格或清單內容難讀。
