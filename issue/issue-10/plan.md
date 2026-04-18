# Issue 10 - HAR Detail 改為 Tabs 並補上 Response Text

本 issue 承接目前已可點擊 HAR 卡片展開 detail panel 的 viewer，聚焦把 detail 改成 tabs 顯示，並在 prepare 階段另外整理出一份較適合閱讀完整回應文字的 `Response Text`，讓人工驗證時可以直接先落在回應本文。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 HAR detail 已可展開，但 `Response` 區塊仍把：

- response meta
- response body

放在同一段文字裡。

這代表當使用者最在意的是「回應本文到底寫了什麼」時，仍需要先越過前面的狀態資訊，閱讀動線不夠直接。

另外目前 detail panel 不是 tab 結構，因此：

- 無法明確切換不同類型內容
- 每次展開都只能看到固定順序
- 不能預設把焦點放在最常看的回應文字

## 2. 目標

本 issue 要回答：

1. 是否能在 prepare 階段額外整理出 `Response Text`，讓前端直接顯示較乾淨的回應本文。
2. HAR detail 是否能改成 tabs 顯示。
3. 每次打開 detail 時，是否能預設停在 `Response Text` tab。

## 3. 執行項目

### Task A. 擴充 HAR detail schema

- Goal: 補上專供閱讀本文的 `responseText` 欄位。
- 預期輸出：
  - HAR event detail 新增 `responseText`
  - `responseText` 會沿用 prepare 階段 decode / truncate 後的文字

### Task B. HAR detail 改為 Tabs

- Goal: 把 detail 內容改成 tab 切換形式，並預設聚焦回應本文。
- 預期輸出：
  - detail panel 使用 tabs 顯示
  - 預設開在 `Response Text`
  - 仍可切到 `Request / Response / Header`

### Task C. 文件與 issue 同步

- Goal: 讓下一輪知道 HAR detail 現在的預設閱讀方式。
- 預期輸出：
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-10/impl.md`

### Task D. 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - issue FEEDBACK 完整回填

## 4. 成功標準

本 issue 若要算成功，至少需滿足：

1. HAR detail 以 tabs 顯示。
2. 其中包含 `Response Text` tab。
3. 每次展開 detail 時預設停在 `Response Text`。
4. `timeline:build` 與 `timeline:prepare` 仍可正常完成。

## 5. 風險

- tabs 增加後，panel 高度與寬度需維持可讀，不然切換後反而更難看。
- `responseText` 與 `response` 若內容重複太多，`timeline.json` 體積會再上升。
- 若回應內容本身是 HTML，`Response Text` 仍會保留原始標記，只是更專注在 body 本文，不會自動轉成純瀏覽畫面。
