# Issue 14 - Timeline Panel 精簡與 Recording 群組操作

## Status

完成。

## Task A - 重整 viewer model 的 group / recording 摘要層

- Goal: 在不改 server 資料格式下，於前端建立可支撐新 UI 的摘要資料。
- Method:
  - 在 `useTimelineModel.js` 保留原始 slices 與 groups，不改 API。
  - 新增 recording group 摘要，把連續且 recording event signature 相同的 slices 合併成一個 group。
  - 新增 `recordingGroupStates` 前端狀態，支援 `hide / shift-left / shift-right`。
  - 新增 group rename / named create 行為，讓 UI 可用預設名稱直接建立。
- Evidence:
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
- Decision: feasible

### FEEDBACK
- Positive: 用 viewer 端摘要層就能把畫面壓縮下來，沒有把這次需求擴大成 server schema 變更。
- Negative: recording group 目前是以「連續 slices 的 recording event id 完全相同」做合併，對近似但不完全相同的頁面仍不會自動併在一起。
- Evidence: `buildRecordingGroups()`、`setRecordingGroupMode()`、`renameGroup()`、`createNamedGroupAtSlice()`。
- Next Run: 若後續要更準確地做「同頁」判定，可再補 page key 或 DOM/title 類型的 page identity。

## Task B - 更新 Timeline Panel UI

- Goal: 移除 Offset 水道，改為小型 group marker 與 compact recording list。
- Method:
  - `TimelineViewer.vue` 移除 `Offset` lane。
  - `Groups` 改用 dot marker + popover input，建立或修改名稱時可直接填入預設值。
  - `Recording` 改為 compact list card，並在 card header 提供 `原 / 隱 / 左 / 右` 狀態切換。
  - `base.css` 同步縮小 lane 高度與元件尺寸，讓畫面密度提高。
- Evidence:
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/styles/base.css`
  - `apps/timeline-viewer/src/App.vue`
- Decision: feasible

### FEEDBACK
- Positive: 群組點標記與 recording 清單改成 compact layout 後，主時間軸能在同一畫面保留更多 thumbnails 與 HAR 資訊。
- Negative: recording group 的 `Shift Left / Shift Right` 目前是固定像素位移，適合解決視覺重疊，但不是精準時間校正。
- Evidence: `group-dot-button`、`recording-group-card`、`recording-mode-button` 等新 UI 結構。
- Next Run: 若實際使用發現左右位移量不夠，可再把固定值改成可設定級距。

## Task C - 驗證與 issue 記錄

- Goal: 確認 viewer build 可通過，並把限制與 FEEDBACK 寫回 issue。
- Method:
  - 執行 `npm run timeline:build` 驗證 viewer 可建置。
  - 更新 `issue/issue-14/plan.md` 與本檔。
- Evidence:
  - `npm run timeline:build`
  - `issue/issue-14/plan.md`
  - `issue/issue-14/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 先補 issue 再做收尾驗證，後續接手時能直接知道這次改的是 viewer layout，不用再追聊天紀錄。
- Negative: 這一輪尚未補自動化 UI 測試，畫面細節仍主要依 build 與人工檢視確認。
- Evidence: `npm run timeline:build` 已成功完成，viewer 產出 `dist/assets/index-*.css/js`；issue 文件也已補齊。
- Next Run: 若這類 panel 調整變頻繁，可補一組 viewer smoke test 或截圖比對。
