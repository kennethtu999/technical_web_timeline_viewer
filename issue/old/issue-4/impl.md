# Issue 4 - Round 管理與人工校正控制台

## Status

完成。

本檔記錄 round-based viewer、control panel 與 viewer-state 持久化的實作結果。

## Task A - 建立 round-based 資料輸出

- Goal: 把 viewer 產出移回 `source/round{n}` 管理，同時保留 app 可直接讀取的鏡像資料。
- Method:
  - 新增 `prepare-rounds.mjs`，掃描 `source/round*`。
  - 每個 round 執行影片切圖、HAR / Recording 解析、timeline 建構。
  - 輸出到：
    - `source/round1/viewer/timeline.json`
    - `source/round1/viewer/viewer-state.json`
    - `source/round1/viewer/round-meta.json`
    - `source/round1/viewer/thumbnails/*`
  - 同步鏡像到 `apps/timeline-viewer/public/generated/round1/*` 與 `public/generated/index.json`。
- Evidence:
  - `source/round1/viewer/timeline.json`
  - `source/round1/viewer/viewer-state.json`
  - `source/round1/viewer/round-meta.json`
  - `apps/timeline-viewer/public/generated/index.json`
  - 實跑 `npm run timeline:prepare`
  - round1 實跑結果：
    - `397` slices
    - `137` JSF HAR events
    - `357` recording events
- Decision: feasible

### FEEDBACK
- Positive: 把 viewer 產出回收到 `source/round1/viewer` 後，原始素材與衍生資料已能在同一個 round 目錄追蹤，管理成本明顯下降。
- Negative: 目前 prepare 流程每次仍會重跑完整切圖，對單一 round 約 12 分鐘影片會有可感等待時間；未來若 round 增加，應補增量判斷或快取。
- Evidence: `source/round1/viewer/*` 實際落檔、`apps/timeline-viewer/public/generated/index.json` 的 round 索引、`npm run timeline:prepare` 執行結果。
- Next Run: 增加 manifest / source hash 檢查，若來源檔未變更則略過重切圖，只重建需要更新的 metadata。

## Task B - 建立 canonical file alias

- Goal: 讓每個 round 都有固定命名的 `video / har / recording` 入口，方便管理與腳本處理。
- Method:
  - 在 `prepare-rounds.mjs` 中為每個 round 建立固定 alias：
    - `video.mp4`
    - `network.har`
    - `recording.json`
  - 保留原始檔名，不覆寫來源檔。
  - 在 `round-meta.json` 中記錄 alias 與 original name 的對照。
- Evidence:
  - `source/round1/video.mp4`
  - `source/round1/network.har`
  - `source/round1/recording.json`
  - `source/round1/viewer/round-meta.json`
- Decision: feasible

### FEEDBACK
- Positive: 以 alias 方式建立固定入口，比直接改原始檔名安全，且仍滿足 round 目錄可管理性。
- Negative: alias 目前依賴本機檔案系統能力；若未來工作環境不支援 symbolic link，需要 fallback 機制。
- Evidence: `round-meta.json` 內的 canonicalFiles 對照，以及 round1 目錄新增的 alias 檔。
- Next Run: 若未來考慮跨平台同步，補上 alias 建立失敗時的 copy / pointer fallback。

## Task C - viewer 支援 round selector 與 control panel

- Goal: 讓使用者可在 UI 切換 round，並用右側 control panel 處理人工校正。
- Method:
  - 重寫 `useTimelineModel.js`，加入：
    - round list
    - selected round
    - start / end anchor
    - hidden slice list
    - persisted offsets
  - 重排 `TimelineViewer.vue`：
    - 左側改為 timeline workspace
    - 上方加入 offset lane
    - 右側改為 control panel
  - 起始點允許從圖片 / HAR item / Recording item 點選後確認，確認後由該 slice 開始重排。
  - 結束點以圖片 slice 為主。
  - 隱藏圖模式下，編輯時全部顯示，完成後收起 hidden slice。
- Evidence:
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/src/styles/base.css`
  - `npm run timeline:build`
- Decision: feasible

### FEEDBACK
- Positive: control panel 收斂後，設定來源、起終點、隱藏圖與 offset 的操作脈絡更集中，符合 POC 的人工校正需求。
- Negative: 本輪只做了單一畫面狀態管理，尚未做 keyboard shortcut、bulk hide、anchor 差異比較等更進階校正工具。
- Evidence: component / composable / style 三個主要檔案的改動，以及 build 成功。
- Next Run: 補上「只看 anchor 區段」、「顯示 start-end 區間摘要」與「hidden slice 快速批次勾選」會更接近實務整理流程。

## Task D - 建立 viewer-state 持久化

- Goal: 在本地開發模式下，把 UI 操作結果寫回 round 目錄。
- Method:
  - 在 `vite.config.js` 新增 local API middleware：
    - `GET /api/round-index`
    - `GET /api/rounds/:roundId/timeline`
    - `GET /api/rounds/:roundId/state`
    - `POST /api/rounds/:roundId/state`
  - 前端優先走 API；若 API 不可用，則 fallback 到 `public/generated/*` 唯讀資料。
  - `viewer-state.json` 存：
    - `startAnchor`
    - `endAnchor`
    - `hiddenSliceIds`
    - `offsets`
- Evidence:
  - `apps/timeline-viewer/vite.config.js`
  - `source/round1/viewer/viewer-state.json`
  - `apps/timeline-viewer/public/generated/round1/viewer-state.json`
- Decision: partial

### FEEDBACK
- Positive: 已建立本地可寫的資料契約，viewer 操作開始能沉澱成 round 內 JSON，而不是只存在前端記憶體。
- Negative: 本輪無法在 sandbox 內完整啟動 dev server 做 API smoke test，執行 `npm run timeline:dev` 遇到 `listen EPERM`；因此持久化 API 目前以程式邏輯與 build 通過作為主要證據，少了實機點選驗證。
- Evidence: `vite.config.js` 的 middleware 路由、`viewer-state.json` 檔案格式、以及 `timeline:dev` 的 `listen EPERM` 訊息。
- Next Run: 在允許綁定本地 port 的環境補做 dev 模式 smoke test，確認 `POST /api/rounds/:roundId/state` 實際寫回流程。

## Task E - 文件同步

- Goal: 更新 README 與 issue 紀錄，讓下一輪接手成本下降。
- Method:
  - 更新 root `README.md` 的目前入口到 `issue-4`
  - 更新 `apps/timeline-viewer/README.md` 的 round-based 使用說明
  - 補完本 `impl.md`
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-4/plan.md`
  - `issue/issue-4/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: README 與 issue 同步後，接手順序與 viewer 目前定位比較一致，不會再停留在 issue-2 / issue-3 的舊狀態。
- Negative: 文件目前仍偏操作說明，尚未補 viewer-state 的 JSON schema 範例，對下一輪若要接 API 或導出格式還不夠完整。
- Evidence: 更新後的 README 與本 issue 文件。
- Next Run: 增補 `viewer-state.json` schema 範例與欄位說明，讓下一輪更容易接前後端或資料整理工具。
