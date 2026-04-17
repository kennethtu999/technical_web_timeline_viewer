# Issue 8 - Control Panel 持久化補齊與 RESET 機制

## Status

完成。

本檔記錄 `viewer-state.json` 擴充、`RESET` 機制、驗證結果與 FEEDBACK。

## Task A - 擴充 viewer-state 契約

- Goal: 把常用的控制台檢視設定納入同一份持久化 state。
- Method:
  - 擴充 `useTimelineModel.js` 的 `createDefaultViewerState`，新增：
    - `zoom`
    - `selectedGroupIds`
    - `requestKindFilter`
    - `requestUrlPattern`
  - 把原本分散在獨立 `ref` 的 `zoom / group filter / HAR kinds / regex` 改為從 `viewerState` 讀寫。
  - 補上 normalize / clamp 邏輯，確保舊版 state、無效 zoom、失效 group id 仍可安全 fallback。
- Evidence:
  - `npm run timeline:build`
  - `source/round1/viewer/viewer-state.json`
  - `apps/timeline-viewer/public/generated/round1/viewer-state.json`
  - build 成功，代表前端資料流已能承接新版 state schema。
  - prepare 成功後，`viewer-state.json` 已包含新增欄位。
- Decision: feasible

### FEEDBACK
- Positive: 把控制台主要設定收斂進同一份 `viewerState` 後，前端讀寫路徑變單純，也不容易再出現「畫面能改但不會保存」的狀況。
- Negative: 目前 group filter 只持久化「選了哪些 group」，不是持久化 group 編輯結果；如果之後要把 `+ / -` 建群也保存，還需要另一層資料契約。
- Evidence: `useTimelineModel.js` 的 state schema 擴充、`viewer-state.json` 實際落檔內容、build / prepare 成功。
- Next Run: 若 group 編輯會成為常態操作，可評估把 local group 變更也納入可追蹤資料，而不是只存 filter。

## Task B - 補上 RESET 機制

- Goal: 提供一個明確且一致的重設入口。
- Method:
  - 在 `TimelineViewer.vue` 的 `Save State` 區塊新增 `RESET` 按鈕與說明文字。
  - 在 `useTimelineModel.js` 新增 `resetViewerState()`，用確認對話框保護誤操作，並把目前 round 的持久化 state 回復到預設值。
  - reset 範圍包含：
    - `startAnchor`
    - `endAnchor`
    - `hiddenSliceIds`
    - `offsets`
    - `zoom`
    - `selectedGroupIds`
    - `requestKindFilter`
    - `requestUrlPattern`
- Evidence:
  - `npm run timeline:build`
  - `TimelineViewer.vue` 已新增 `RESET` 事件與說明
  - `useTimelineModel.js` 已新增 `resetViewerState()` 與確認機制
- Decision: feasible

### FEEDBACK
- Positive: reset 集中在單一入口後，重新檢查同一個 round 不需要逐項清除，對人工驗證流程很直接。
- Negative: 目前 reset 仍依賴瀏覽器 `confirm`，對未來若要做更細的重設範圍選擇或更一致的 UI 風格，還不算最終形式。
- Evidence: `TimelineViewer.vue` 的按鈕與說明、`useTimelineModel.js` 的 reset 邏輯、build 成功。
- Next Run: 若後續出現「只重設 filter、不清 anchor/offset」的需求，可再拆成 `RESET FILTERS` 與 `RESET ALL`。

## Task C - 同步 prepare / dev / 文件

- Goal: 避免不同入口對 `viewer-state` 的預設格式理解不一致。
- Method:
  - 更新 `prepare-rounds.mjs` 的 `createDefaultViewerState` 與 `sanitizeViewerState`，讓 prepare 後寫出的狀態檔可承接新版欄位。
  - 更新 `vite.config.js` 的預設 state，讓 dev middleware 缺檔時回傳相同 schema。
  - 更新 `README.md` 與 `apps/timeline-viewer/README.md`，說明目前會持久化哪些控制台設定，以及 `RESET` 的範圍。
  - README 主入口改指向 `issue-8`，避免接手者仍停留在前一輪議題。
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `apps/timeline-viewer/scripts/prepare-rounds.mjs`
  - `apps/timeline-viewer/vite.config.js`
  - `issue/issue-8/plan.md`
- Decision: feasible

### FEEDBACK
- Positive: 這次把前端、dev middleware、prepare 與文件一起同步，減少了「某一端知道新欄位、另一端還停在舊格式」的風險。
- Negative: issue 編號途中發現 `issue-7` 已有既有主題，這輪需改以 `issue-8` 留痕；若只看舊入口，可能短暫混淆。
- Evidence: README 與 app README 的文字更新、prepare / vite 端的 default state 同步、issue-8 新增。
- Next Run: 若之後再擴充 viewer-state，建議抽成共享 schema 或至少在文件保留欄位表，避免三處 default 重複維護。

## Task D - 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare，並留下證據與 FEEDBACK。
- Method:
  - 執行 `npm run timeline:build` 驗證前端編譯。
  - 執行 `npm run timeline:prepare` 驗證 round1 重建與 viewer-state 升級。
  - 回填本檔與 `issue/issue-8/plan.md`。
- Evidence:
  - `npm run timeline:build`
  - build 成功
  - `npm run timeline:prepare`
  - round1 實跑結果：
    - `Prepared round1: 82 slices / 146 HAR / 357 recording`
- Decision: feasible

### FEEDBACK
- Positive: build 與 prepare 都過，代表這次不只 UI 能編譯，連 round 流程也能正確產出新版 state。
- Negative: sandbox 內仍無法直接起 dev server 做手動點選 smoke test，因此這輪主要證據仍以 build / prepare 與程式邏輯為主。
- Evidence: `timeline:build` 成功輸出、`timeline:prepare` 成功輸出、round1 viewer-state 升級結果。
- Next Run: 在可開本地 port 的環境補一次實機操作，確認重整頁面後 `zoom / group / HAR filter / regex` 確實會帶回，且 `RESET` 會實際寫回檔案。
