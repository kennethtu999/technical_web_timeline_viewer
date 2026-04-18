# Issue 13 - timeline-server 輕量化拆分與 baseline 試轉流程

本 issue 目標是把目前 `apps/timeline-viewer` 內同時承擔的 prepare 腳本、dev API、baseline 校正流程拆出為獨立的 `apps/timeline-server`，讓 viewer 只專注在檢視與操作，後端則負責：

- round index / timeline / viewer state API
- `page_login.json` 的 `video_offset_ms` 微調
- 依前端指定秒數範圍與時間點進行即時試轉
- 確認後再全部套用，產出完整時間點圖片

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 `apps/timeline-viewer` 內存在三種不同責任：

- `scripts/prepare-rounds.mjs` 的離線資料準備
- `vite.config.js` 內嵌 `timelineApiPlugin()` 的本地 API
- viewer Control Panel 的操作與狀態保存

這種結構在先前 HAR-driven prepare 階段還能工作，但在正式使用中已出現兩個結構性問題：

- 前端若要做 baseline `video_offset_ms` 微調與 60 秒試轉，只能把更多 I/O 與 ffmpeg 行為塞進 Vite dev server。
- prepare 與即時試轉共用大量規則，但目前沒有可重用的後端模組，導致 viewer、script、dev server 容易重複邏輯。

因此本輪優先目標不是平台化，而是先做一個輕量、可驗證、可接手的 `timeline-server`，把正式工作需要的後端能力收斂起來。

## 2. 本次明確方案

### 2.1 新增 apps/timeline-server

- 建立輕量 Node server，作為 timeline viewer 的唯一後端入口。
- `timeline-server` 依任務拆成不同隻程式：
  - `server-web`
  - `task-prepare`
  - `task-preview`
  - `task-apply`
- 把現行 `timelineApiPlugin()` 內的 round index / timeline / state API 轉入 server。
- 把 `prepare-rounds.mjs` 中可重用的資料準備與 ffmpeg/ffprobe 邏輯抽成 server 可直接呼叫的模組。
- `dev` 模式需支援 hot reload。

### 2.2 viewer 改走 server API

- `timeline-viewer` 不再依賴 Vite plugin 直接提供 API。
- Vite dev server 僅保留前端開發用途，viewer 透過設定好的 base URL 呼叫 `timeline-server`。
- round index / timeline / state 保存流程需維持相容，避免既有 round 檢視能力回退。
- viewer 縮圖與試轉圖都由 `GET /assets/rounds/round{no}/...` 提供，必須有 round 子目錄隔離。

### 2.3 baseline 試轉流程

- Control Panel 新增 baseline 區塊。
- 由前端輸入：
  - 試轉開始秒數
    - 預設 `0`
  - 試轉結束秒數
    - 預設 `60`
  - 要取圖的時間點清單
  - `video_offset_ms` 微調值
- 後端先把新 offset 寫回 `source/baseline/page_login.json`，並執行轉換。
- 試轉成功後，前端可點「全部套用」，由 server 依完整時間點產圖。

### 2.4 文件與驗證

- README 要明確說明 `timeline-viewer` 與 `timeline-server` 的分工。
- issue `impl.md` 要記錄：
  - 拆分後的責任邊界
  - 試轉流程可行性
  - 風險與限制

## 3. 執行項目

## Task A. 建立 timeline-server 基礎骨架

- Goal: 建立可啟動的 `apps/timeline-server`，承接原本 viewer API。
- 預期輸出：
  - `apps/timeline-server/package.json`
  - `server-web / task-prepare / task-preview / task-apply`
  - round index / timeline / state API

## Task B. 抽離 prepare / baseline / capture 共用模組

- Goal: 讓離線 prepare 與即時試轉共用同一組規則，避免 viewer / server / script 各自複製。
- 預期輸出：
  - 共用 round / baseline / capture service
  - 試轉與全部套用可共用的 frame extraction 流程

## Task C. baseline offset 試轉 API

- Goal: 提供 Control Panel 可用的 offset 更新、60 秒試轉與全部套用 API。
- 預期輸出：
  - 更新 `page_login.json` `video_offset_ms`
  - 試轉 API
  - 全量套用 API

## Task D. 更新 timeline-viewer 串接與 Control Panel

- Goal: viewer 改串 `timeline-server`，並提供 baseline 校正 UI。
- 預期輸出：
  - API base URL 設定
  - baseline 控制區塊
  - 試轉結果顯示與全部套用操作

## Task E. 驗證與文件同步

- Goal: 確認結構拆分後，正式流程仍能支撐 round 驗證工作。
- 預期輸出：
  - `timeline:build`
  - `timeline-server` 啟動驗證
  - 試轉 / 全部套用流程驗證
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `apps/timeline-server/README.md`
  - `issue/issue-13/impl.md`

## 4. 預期輸出格式

每個任務完成後，至少要輸出以下內容：

```md
## 任務名稱

- Goal:
- Method:
- Evidence:
- Decision: feasible / infeasible / partial

### FEEDBACK
- Positive:
- Negative:
- Evidence:
- Next Run:
```

## 5. 成功標準

本 issue 若要算成功，至少需滿足：

1. `timeline-viewer` 的 API 不再綁在 `vite.config.js`。
2. `apps/timeline-server` 可提供 round index / timeline / state API。
3. Control Panel 可更新 `page_login.json` 的 `video_offset_ms`，並執行 60 秒試轉。
4. 試轉確認後可觸發全部套用，重新取得所有時間點圖片。
5. viewer 縮圖與試轉圖都改由 `/assets/rounds/round{no}/...` 提供。
6. 文件與 issue 記錄足以讓下一輪直接接手。
