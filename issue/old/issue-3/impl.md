# Issue 3 - Timeline Viewer 基礎版

## Status

部分完成。

本檔將記錄 timeline viewer 基礎版的建置結果、資料準備方式與 FEEDBACK。

## Task A / Task B / Task C / Task D / Task E - Timeline Viewer 基礎版實作

- Goal: 建立 `Node.js + Vue 3` 的基礎版 timeline viewer，並提供一條指令完成 `video -> thumbnails -> viewer data` 準備。
- Method:
  - 新增 `apps/timeline-viewer/`，採 `Vue 3 + Vite + Naive UI`。
  - 實作左到右 timeline，分成三條水道：
    - thumbnail slices
    - request / response
    - recording steps
  - 以 slice 為主要切面，提供 hover preview、slice selection、group、`+/- offset ms`。
  - 新增 `prepare-round1.mjs`，自動：
    - 呼叫 `tools/video-to-images/screenshot.py`
    - 複製縮圖到 app public
    - 解析 HAR / Recording / manifest
    - 產出 `timeline.json`
  - HAR 先依 JSF 特性分成：
    - `document-get`
    - `document-post`
    - `ajax`
  - 新增 root npm scripts，讓 repo root 可直接執行 `timeline:prepare` / `timeline:dev` / `timeline:build`。
- Evidence:
  - `apps/timeline-viewer/scripts/prepare-round1.mjs`
  - `apps/timeline-viewer/src/App.vue`
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/public/generated/round1/timeline.json`
  - `apps/timeline-viewer/public/generated/round1/thumbnails/*`
  - 實跑 `node apps/timeline-viewer/scripts/prepare-round1.mjs`
  - 實跑結果：
    - `397` slices
    - `137` JSF HAR events
    - `357` recording events
    - `2` initial groups
- Decision: feasible

### FEEDBACK
- Positive: 以影片切圖作為 slice 主單位，再把 HAR / Recording 掛進同一條 timeline，是一條很直接且可擴充的 viewer 路線；一條指令能重建縮圖與 viewer data，對 POC 很有幫助。
- Negative: Recording 原始 JSON 沒有明確時間戳，所以目前 recording lane 仍是 heuristic mapping；另外這輪已驗證 Node data-prep 流程，但尚未在瀏覽器中完成完整 UI smoke test。
- Evidence: `apps/timeline-viewer/public/generated/round1/timeline.json` 的統計結果、`prepare-round1.mjs` 的資料轉換邏輯、以及 root / app package scripts。
- Next Run: 安裝前端依賴並啟動 viewer，實際操作 group / offset / hover preview；接著把 recording lane 從 index-based heuristic 改成可人工校正或 anchor-based mapping。
