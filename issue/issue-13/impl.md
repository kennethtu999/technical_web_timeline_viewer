# Issue 13 - timeline-server 輕量化拆分與 baseline 試轉流程

## Status

完成。

本檔記錄 `timeline-server` 拆分、viewer 串接、baseline 試轉流程與驗證結果。

## Task A - 建立 timeline-server 基礎骨架

- Goal: 建立可啟動的 `apps/timeline-server`，承接原本 viewer API。
- Method:
  - 新增 `apps/timeline-server/package.json`。
  - 新增 `server-web / task-prepare / task-preview / task-apply` 四個入口程式。
  - root `package.json` 新增 `timeline:server`，`timeline:prepare` 改由 `timeline-server` 執行。
  - `timeline-server` `dev` 改成 `node --watch`，讓 server code 變更時可 hot reload。
- Evidence:
  - `apps/timeline-server/package.json`
  - `apps/timeline-server/src/server-web.mjs`
  - `apps/timeline-server/src/task-prepare.mjs`
  - `apps/timeline-server/src/task-preview.mjs`
  - `apps/timeline-server/src/task-apply.mjs`
  - `npm run timeline:server`
- Decision: feasible

### FEEDBACK
- Positive: 用多入口程式切 server task 之後，HTTP、prepare、preview、apply 的責任比單一入口清楚。
- Negative: `prepare` 內部目前仍是第一版共用 orchestration，video / HAR / recording 的內部 service 還可再繼續細拆。
- Evidence: `apps/timeline-server/src/*` 結構與 `timeline:server` 可啟動。
- Next Run: 下一輪若 prepare 規則再增加，優先把 HAR 與 recording 內部邏輯再拆成獨立 service 檔。

## Task B - 抽離 prepare / baseline / capture 共用模組

- Goal: 讓離線 prepare 與即時試轉共用同一組規則，避免 viewer / server / script 各自複製。
- Method:
  - 將 `apps/timeline-viewer/scripts/prepare-rounds.mjs` 改為薄 wrapper，直接呼叫 `apps/timeline-server/src/lib/prepare.js`。
  - `timeline-server` 共用模組接手 round prepare、baseline 讀寫、preview 產圖與 apply。
  - HAR-driven timeline 輸出改直接使用 `/assets/rounds/round{n}/viewer/thumbnails/*` URL。
- Evidence:
  - `apps/timeline-viewer/scripts/prepare-rounds.mjs`
  - `apps/timeline-server/src/lib/prepare.js`
  - `source/round1/viewer/timeline.json`
- Decision: feasible

### FEEDBACK
- Positive: viewer script 變成薄 wrapper 後，prepare 真正只剩 server 端一份主邏輯，重複規則明顯減少。
- Negative: `src/lib/prepare.js` 目前仍偏大，雖然已成為 server 端單一事實來源，但內部仍可再切更細。
- Evidence: `timeline:prepare` 成功、`timeline.json` 的 `thumbnailSrc` 已改成 `/assets/rounds/round1/...`。
- Next Run: 下輪若要再降複雜度，優先把 `prepare` 內部再切成 `video / har / recording` service。

## Task C - baseline offset 試轉 API

- Goal: 提供 Control Panel 可用的 offset 更新、60 秒試轉與全部套用 API。
- Method:
  - 新增 `GET /api/baseline/page-login`。
  - 新增 `POST /api/rounds/:roundId/baseline/preview`，預設 `startSec=0`、`endSec=60`。
  - preview 會先寫回 `source/baseline/page_login.json` 的 `video_offset_ms`，再依前端指定秒數產圖。
  - preview 會以「舊 offset -> 新 offset」的差值重算實際取圖秒數，避免只改設定檔但畫面仍抽同一秒。
  - 新增 `POST /api/rounds/:roundId/baseline/apply`，用最新 offset 重跑該 round prepare。
- Evidence:
  - `apps/timeline-server/src/server-web.mjs`
  - `curl -s http://127.0.0.1:4174/api/round-index`
  - `curl -s -X POST http://127.0.0.1:4174/api/rounds/round1/baseline/preview ...`
  - `curl -s -X POST http://127.0.0.1:4174/api/rounds/round1/baseline/apply ...`
- Decision: feasible

### FEEDBACK
- Positive: preview / apply 兩條 API 都以同一份 baseline 設定為準，流程一致性比原本塞在 viewer dev plugin 裡清楚。
- Negative: preview 現在仍是以「目前 timeline 秒數 + offset 差」重算試轉點，主要用來快速驗看畫面；若未來要做更強的 HAR 對齊試轉，仍可再往上疊一層規則。
- Evidence: preview API 回傳 `previewJobId` 與 `/assets/rounds/round1/preview/...`，apply API 成功回傳最新 round meta。
- Next Run: 若之後需要更精準的 offset 驗證，可再擴成「HAR 候選點 subset preview」模式。

## Task D - 更新 timeline-viewer 串接與 Control Panel

- Goal: viewer 改串 `timeline-server`，並提供 baseline 校正 UI。
- Method:
  - 移除 `vite.config.js` 內的 `timelineApiPlugin()`，改成只保留 `/api`、`/assets` proxy。
  - `useTimelineModel.js` 改只走 `/api`。
  - `TimelineViewer.vue` 新增 baseline trial 區塊，包含：
    - `video_offset_ms`
    - 試轉開始秒數
    - 試轉結束秒數
    - 取圖時間點
    - `試轉 60 秒`
    - `全部套用`
  - 試轉結果不再顯示在 Control Panel，而是直接覆蓋 Round 內對應 slice 的縮圖，讓使用者直接在主 timeline 比對是否對齊。
- Evidence:
  - `apps/timeline-viewer/vite.config.js`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/App.vue`
- Decision: feasible

### FEEDBACK
- Positive: viewer 只保留 UI 與操作狀態後，server / assets / baseline preview 的責任邊界清楚很多。
- Negative: 目前試轉縮圖是以「requested capture sec 對應最近 slice」覆蓋回 Round，若未來輸入的點位不是來自 slice 時間，可能還要補更明確的 mapping 規則。
- Evidence: viewer build 成功，Control Panel 已新增 baseline 區塊，且試轉圖會直接反映到 Round 縮圖。
- Next Run: 若實際使用者覺得 preview 點位太多或太少，可再補模板或快捷按鈕。

## Task E - 驗證與文件同步

- Goal: 確認結構拆分後，正式流程仍能支撐 round 驗證工作。
- Method:
  - 執行 `npm run timeline:prepare`
  - 執行 `npm run timeline:build`
  - 以提升權限啟動 `npm run timeline:server`
  - 驗證 `/api/health`、`/api/round-index`、baseline preview、baseline apply、與 `/assets/rounds/round1/...`
  - 更新 root `README.md`、`apps/timeline-viewer/README.md`、`apps/timeline-server/README.md`
- Evidence:
  - `npm run timeline:prepare` 成功：`Prepared round1: 107 slices / 146 HAR / 357 recording`
  - `npm run timeline:build` 成功
  - `GET /api/health` 成功
  - `GET /api/round-index` 成功
  - `POST /api/rounds/round1/baseline/preview` 成功，回傳 `5` 張 preview 圖
  - `GET /assets/rounds/round1/viewer/thumbnails/login-anchor.jpg` 成功，回傳 `200 image/jpeg`
  - `POST /api/rounds/round1/baseline/apply` 成功
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `apps/timeline-server/README.md`
- Decision: feasible

### FEEDBACK
- Positive: `prepare`、`build`、`server API`、`assets`、`preview`、`apply` 都有實測過，這次拆分不是只停在結構草圖。
- Negative: 本次 server 啟動與本機 `curl` 驗證在沙箱內需要提升權限，代表未來若要在更受限環境驗證，需要另外準備測試策略。
- Evidence: build / prepare / curl 實測輸出與新文件內容。
- Next Run: 若下一輪要做自動驗證，優先補一組不依賴桌面沙箱限制的 server API smoke test。

## Task F - server request log

- Goal: 讓 `timeline-server` 在開發與維運時能直接看到 HTTP request log。
- Method:
  - 在 `server-web.mjs` 加入統一 request log。
  - request 進來時記錄 `method / url / ip`。
  - response 完成時記錄 `status / duration`。
  - 若連線中途關閉，會標示 `aborted=true`。
- Evidence:
  - `apps/timeline-server/src/server-web.mjs`
- Decision: feasible

### FEEDBACK
- Positive: 用統一 log hook 後，不需要在每支 route 手工加 `console.log`，後續新增 API 比較不會漏。
- Negative: 目前 log 仍是 plain text console output，若未來請求量變大，可能要再補 level、request id 或 structured log。
- Evidence: `server-web.mjs` 的 `logRequestStart()` / `logRequestFinish()` 與 `res.finish / res.close` hook。
- Next Run: 若下一輪要追 preview / apply 的背景耗時，可再補 request id 串到 deeper service log。

## Task G - prepare 內部拆分為 video / HAR / recording service

- Goal: 把 `apps/timeline-server/src/lib/prepare.js` 內過度耦合的影片、HAR、recording 邏輯拆成各自檔案，降低後續維護成本。
- Method:
  - 新增 `apps/timeline-server/src/lib/prepare/shared.js`，集中路徑、常數、baseline、viewer state 與共用 I/O。
  - 新增 `apps/timeline-server/src/lib/prepare/video.js`，承接 `ffprobe`、`ffmpeg`、sampling 與 frame extraction。
  - 新增 `apps/timeline-server/src/lib/prepare/har.js`，承接 HAR detail、capture candidate、slice 與 event attach。
  - 新增 `apps/timeline-server/src/lib/prepare/recording.js`，承接 recording label、event enrich 與 login anchor 選擇。
  - `prepare.js` 改回 orchestration 與 public API 入口，外部 import 路徑維持不變。
  - `extractFrameByOffset()` 轉圖時新增 log，直接印出輸出檔名與影片秒數。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/src/lib/prepare/shared.js`
  - `apps/timeline-server/src/lib/prepare/video.js`
  - `apps/timeline-server/src/lib/prepare/har.js`
  - `apps/timeline-server/src/lib/prepare/recording.js`
  - `npm run timeline:prepare`
- Decision: feasible

### FEEDBACK
- Positive: prepare 入口保留原路徑後，CLI、server route 與 viewer wrapper 不需要跟著改 import，拆分風險低。
- Negative: `shared.js` 目前仍承接不少共用規則，雖然已把三大職責拆出，但後續若再長大，可能還要再切 `baseline` 與 `viewer-state`。
- Evidence: `node --check` 驗證新模組皆可載入，`npm run timeline:prepare` 成功且 log 已印出 `at 11.653s from video.mp4` 這類取圖秒數。
- Next Run: 若下一輪還要擴 prepare，可優先再把 `shared.js` 依 `baseline / state / filesystem` 三層拆開。

## Task H - HAR / recording / capture 秒數單元測試

- Goal: 補一組可直接看出「前 10 個 HAR 要處理的請求、對應 recording、以及影片實際取圖秒數」的測試，降低未來重構風險。
- Method:
  - 在 `prepare.js` 新增 `inspectRoundHarProcessing()` 與 `buildHarProcessingPreview()`，只做資料對齊，不碰 ffmpeg。
  - 測試直接讀 `round1` 的 `network.har`、`recording.json` 與 baseline 設定，產出前 10 筆 HAR preview。
  - 預期結果寫入 `apps/timeline-server/test/fixtures/round1-first-10-har-processing.expected.json`。
  - 測試執行時用 diagnostic 印出每筆 `HAR# / method / pathname / capture 秒數 / recording`。
  - `apps/timeline-server/package.json` 與 root `package.json` 新增測試腳本，README 同步補上跑法。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/test/prepare.har-processing.test.js`
  - `apps/timeline-server/test/fixtures/round1-first-10-har-processing.expected.json`
  - `npm run timeline:test`
- Decision: feasible

### FEEDBACK
- Positive: 這組測試直接鎖住實際 round1 的 HAR / recording 對齊結果，執行時又會把摘要印出來，除錯效率高。
- Negative: 目前 fixture 直接依賴 round1 真實資料，若來源 HAR 有更新，測試會跟著需要更新預期檔。
- Evidence: `npm run timeline:test` 通過，輸出包含 `HAR#1 GET /EB/ebcontent.jsp [get-after] capture=11.653s` 等 diagnostic。
- Next Run: 若之後 round 樣本變多，可再補第 2 組 fixture，把登入後或 POST 流程較重的案例獨立鎖住。

## Task I - URL 排除名單與 login slice 補強

- Goal: 提供可配置的 URL expr 排除能力，並修正 login `GET / POST` 與 `Click 登入` 在 preview 中的可見性。
- Method:
  - `source/baseline/page_login.json` 新增 `exclude_url_exprs` 支援。
  - HAR candidate 產生時，若 URL 命中 `exclude_url_exprs` 就直接排除。
  - `exclude_url_exprs` 優先視為 regex，解析失敗才退回 substring 比對。
  - baseline `show_login_page` / `submit_login_page` 命中的 login 規則不受排除名單影響。
  - login `POST` 若命中 baseline submit rule，即使 response content-type 缺失，也強制保留為 capture candidate。
  - recording 對齊後再做 baseline-aware 校正，讓 `Click 登入` 更接近 login `GET / POST` slice。
- Evidence:
  - `apps/timeline-server/src/lib/prepare/har.js`
  - `apps/timeline-server/src/lib/prepare/recording.js`
  - `apps/timeline-server/test/prepare.har-processing.test.js`
  - `README.md`
  - `apps/timeline-server/README.md`
  - `npm run timeline:test`
- Decision: feasible

### FEEDBACK
- Positive: `exclude_url_exprs` 放在 baseline config 後，不用改 round 結構就能快速排除雜訊頁，對實際驗證流程比較友善。
- Negative: 目前 URL expr 是全域 baseline 規則，還不能針對單一 round 做差異化排除。
- Evidence: 測試已驗證排除名單會生效，同時 login `GET / POST` 仍保留；`round1` preview 也已出現 `harEntryIndex: 203` 的 login `POST`。
- Next Run: 若後續有 per-round 差異需求，可再往 `source/round{n}` 加 round-local override config。

## Task J - submit_login_page.video_ms 絕對定位支援

- Goal: 讓 baseline 可用 `submit_login_page.video_ms` 直接提供影片絕對定位，降低對登入頁圖片比對的依賴。
- Method:
  - 在 prepare 入口新增 `resolveEffectiveVideoStart()`。
  - 當 `submit_login_page.video_ms` 存在，且 `video_offset_ms` 未設定或為 `0` 時，改用命中的 submit login HAR `POST` 絕對時間反推有效影片起點。
  - 若 `video_offset_ms` 已是非 `0`，仍保留手動 offset 優先，避免直接改掉既有 round 對齊結果。
  - 補測試驗證 `video_ms` 生效與 `video_offset_ms` 優先兩條路徑，README 同步說明。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/test/prepare.har-processing.test.js`
  - `README.md`
  - `apps/timeline-server/README.md`
- Decision: feasible

### FEEDBACK
- Positive: 把 `video_ms` 接在 `effectiveVideoStartMs` 計算層，後面的 HAR slice、recording attach、viewer 不需要跟著大改。
- Negative: `video_ms` 目前是以 submit HAR request 當錨點；若輸入的人填的是「畫面感知時間」而不是 request 發出時間，仍可能有秒級誤差。
- Evidence: round1 現有 `submit_login_page.video_ms=24500` 與 HAR submit request 可被程式解析；測試已覆蓋 `video_ms` 與手動 offset 優先兩條路徑。
- Next Run: 若實際輸入者提供的 `video_ms` 比較偏向畫面感知點，可再補一層 `anchor_kind`，明確區分 `request-start / post-before / post-after`。

## Task K - 定位規則收斂為 submit_login_page.video_ms

- Goal: 移除 `recording.click` 與 `video_offset_ms` 這類多重定位路徑，只保留 `submit_login_page.video_ms` 作為登入定位來源。
- Method:
  - `resolveEffectiveVideoStart()` 改成只接受 `submit_login_page.video_ms`，並把它解讀為「肉眼看到按鈕被按下」的時間。
  - 推回影片起點時，改用 submit HAR `POST` 的 `request-start - 0.5 秒` 對齊視覺按下點。
  - 移除 `submit_login_page.recording` config 與 `alignRecordingEventsWithBaseline()` 等 recording hint 邏輯。
  - 移除 `video_offset_ms` 的 server API / CLI / viewer UI / config 寫回流程。
  - baseline preview 改成只依現有 config 試轉，不再改寫定位欄位。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/src/lib/prepare/recording.js`
  - `apps/timeline-server/src/server-web.mjs`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `source/baseline/page_login.json`
- Decision: feasible

### FEEDBACK
- Positive: 只留一條定位規則後，baseline config、prepare、preview、viewer 的語意一致很多，下一輪不需要再猜到底是哪一條規則生效。
- Negative: 現在 `submit_login_page.video_ms` 變成必要欄位；若輸入者沒填或填錯，prepare 會直接失敗，不再有次佳 fallback。
- Evidence: 程式碼中已無 `recording.click` 與 `video_offset_ms` 相關實作；試轉 API 也不再接收 offset 參數。
- Next Run: 若後續發現不同資料來源對「按下時間」定義不一致，可再補一個明確的 `anchor_kind` 枚舉，但不要再回到多條自動猜測路徑。
