# Issue 12 - HAR 時間點驅動截圖（ffmpeg 純 Node 流程）

## Status

完成。

本檔記錄 HAR-driven prepare、baseline 登入錨點、`page_login.json` 設定、驗證結果與 FEEDBACK。

## Task A - 移除 Python 正式依賴，改由 Node + ffmpeg/ffprobe 取圖

- Goal: 讓 `prepare-rounds.mjs` 正式流程不再依賴 `screenshot.py` 與 `manifest.json`。
- Method:
  - 直接重寫 `apps/timeline-viewer/scripts/prepare-rounds.mjs` 主流程。
  - 新增 `probeVideoDurationMs()`，用 `ffprobe -v quiet -print_format json -show_format` 讀影片長度。
  - 新增 `extractFrameByOffset()`，以 `ffmpeg -ss ... -i ... -frames:v 1 -q:v 2` 擷取單張縮圖。
  - `prepare` 改成輸出 `source/round{n}/artifacts/har-captures/captures.json`，不再讀 scene manifest。
- Evidence:
  - `apps/timeline-viewer/scripts/prepare-rounds.mjs`
  - `source/round1/artifacts/har-captures/captures.json`
  - `npm run timeline:prepare`
- Decision: feasible

### FEEDBACK
- Positive: 把 ffprobe/ffmpeg 直接收進 Node 流程後，正式 prepare 不再依賴 Python 環境，部署與交接成本明顯下降。
- Negative: 目前仍仰賴系統安裝好的 `ffmpeg` / `ffprobe`，若環境缺少 binary，prepare 會直接失敗。
- Evidence: `prepare-rounds.mjs` 的 `probeVideoDurationMs()` 與 `extractFrameByOffset()`、`timeline:prepare` 成功。
- Next Run: 若未來要進一步降低環境差異，可補一段啟動前檢查，先明確提示 ffmpeg/ffprobe 缺失。

## Task B - 依 HAR 規則建立 capture candidates 與 slices

- Goal: 用 HAR 事件直接產生縮圖與 slice，而不是讀 scene manifest。
- Method:
  - 只挑 `GET / POST` 且 `Content-Type` prefix 為 `text/htm` 的事件建立 capture candidates。
  - `GET` 使用 `response + 0.5 秒`，`POST` 使用 `request - 0.5 秒` 與 `response + 0.5 秒`。
  - 建立同秒、同 `captureKind`、同 `pathname` 的去重規則。
  - slice 改為 HAR-driven schema，保留 `captureKind`、`harEntryIndex`、`requestStartedAt`、`responseReceivedAt`、`captureAt` 等欄位。
  - 同時保留 HAR lane 既有 `document-get / document-post / ajax` 事件，讓 viewer 仍可查完整 request context。
- Evidence:
  - `apps/timeline-viewer/scripts/prepare-rounds.mjs`
  - `source/round1/viewer/timeline.json`
  - `source/round1/artifacts/har-captures/captures.json`
  - round1 重建結果：`110` 張 slice，其中 `GET after = 68`、`POST before = 21`、`POST after = 21`
- Decision: feasible

### FEEDBACK
- Positive: 這次把「取圖規則」直接寫成 HAR-driven schema 後，slice 與來源事件的追溯關係比 scene manifest 更直接。
- Negative: 目前 round1 有 `4594` 筆事件因 `non-html-content-type` 被跳過，代表正式畫面證據目前仍偏重 HTML 類頁面，對非 HTML response 的可視化還有限。
- Evidence: `captures.json` 的 `captures`、`summary`、`skippedByReason`，以及重建後 `timeline.json` 的 slice 結構。
- Next Run: 若後續要納入更多流程頁面，可把 content type 與 capture rule 抽成集中設定，而不是只靠常數。

## Task C - 以 `source/baseline` 自動建立登入錨點

- Goal: 讓 prepare 自動把 baseline 登入圖與 `page_login.json` 規則掛進 timeline。
- Method:
  - 讀取 `source/baseline/page_login.json` 與 `page_login.jpg`。
  - `page_login.json` 目前支援：
    - `video_offset_ms`
    - `show_login_page`
    - `submit_login_page`
    - `submit_login_page.recording.click.string`
    - `submit_login_page.recording.click.order`
  - 先用原始 HAR entry 找 `submit_login_page`。
  - 再用 Recording click hint 與 `order` 從多次 submit 中挑主要登入送出點。
  - 最後回推最後一個 `show_login_page` slice，標記 `pageHint: "login-anchor"`。
  - 建立 `group-login-anchor`。
  - 若 baseline 圖存在，將該 slice 的 `thumbnailSrc` 指向 `thumbnails/login-anchor.jpg`。
  - 若 viewer-state 尚未有起點，預設將 `startAnchor` 指到 login anchor slice。
- Evidence:
  - `source/baseline/page_login.json`
  - `source/round1/viewer/timeline.json`
  - `source/round1/viewer/viewer-state.json`
  - `source/round1/viewer/thumbnails/login-anchor.jpg`
  - round1 login anchor：`har-0004__get-after__00-00-12.134`
  - round1 submit target：`har-203`
- Decision: feasible

### FEEDBACK
- Positive: 這次把 baseline 改成 `page_login.json` 後，登入頁顯示與登入送出可以分開描述，對齊比單一 URL prefix 穩定。
- Negative: Recording click hint 目前仍是字串包含判斷，不是完整 selector matching；若未來有多個同名按鈕，還可能需要更細規則。
- Evidence: `timeline.json` 中 login anchor slice、`viewer-state.json` 的 `startAnchor`、以及實際產生的 `login-anchor.jpg`。
- Next Run: 若後續發現多次登入頁都需保留，可再把 `page_login.json` 擴成多組 flow 規則與更細的 recording selector。

## Task D - 調整 prepare 主流程與 metadata

- Goal: 讓 `timeline.json` / `round-meta.json` 承接 HAR-driven slice 語意。
- Method:
  - `round-meta.json` 與 `timeline.json` 新增 `captureStrategy`。
  - `rawSceneCount`、`skippedOverlapCount`、`overlapRule` 改為 `null`。
  - `canonicalFiles` 補上 `loginAnchor` 來源資訊。
  - 額外落 `captures.json`，保留 capture 與 skipped reason。
- Evidence:
  - `source/round1/viewer/round-meta.json`
  - `source/round1/viewer/timeline.json`
  - `source/round1/artifacts/har-captures/captures.json`
- Decision: feasible

### FEEDBACK
- Positive: metadata 語意這次有一起更新，不會再把 HAR-driven slice 誤解成 scenedetect 場景切圖。
- Negative: viewer 目前仍沿用 `sceneIndex` 作為畫面標籤，只是現在它代表 HAR-driven slice 順序，不再代表原始場景編號。
- Evidence: `round-meta.json` 的 `captureStrategy` 與 `canonicalFiles.loginAnchor`、`timeline.json` 的 `rawSceneCount: null`。
- Next Run: 若使用者後續會直接讀欄位名稱，可再考慮把 `sceneIndex` 重命名成更中性的 `sliceIndex`。

## Task E - 文件與 issue 同步

- Goal: 讓下一輪知道正式 prepare 流程已改為 HAR-driven。
- Method:
  - 更新 root `README.md`，補上 baseline、ffmpeg 前提與 HAR-driven 截圖規則。
  - 更新 `apps/timeline-viewer/README.md`，改寫 prepare 資料來源與限制。
  - 更新 `tools/video-to-images/README.md`，明確標示 `screenshot.py` 仍可單獨使用，但已不是正式 prepare 主流程。
  - 回填本檔。
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `tools/video-to-images/README.md`
  - `issue/issue-12/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 這輪文件已把「場景切圖工具」與「正式 HAR-driven prepare」的定位拆清楚，下一輪比較不會混用。
- Negative: 文件目前仍以規則摘要為主，若未來 capture rule 再增加，可能需要獨立 schema 或 examples 文件。
- Evidence: 三份 README 與 issue-12 文件更新內容。
- Next Run: 若後續規則再增長，可整理一份 `capture-rules` 文件，專門放事件篩選、時間點與 skipped reason 說明。

## Task F - 驗證

- Goal: 確認 HAR-driven prepare 之後，viewer 與 round1 可正常使用。
- Method:
  - 執行 `npm run timeline:build` 驗證 viewer 編譯。
  - 執行 `npm run timeline:prepare` 重建 round1。
  - 用 `node` 檢查 `timeline.json`、`viewer-state.json`、`round-meta.json`、`captures.json`。
  - 確認 login anchor、capture counts、`post-after` 是否存在，以及 `sampling/` 保底取樣圖是否生成。
- Evidence:
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - build 成功
  - prepare 成功：`Prepared round1: 110 slices / 146 HAR / 357 recording`
  - login anchor 成功對到：
    - `sliceId = har-0004__get-after__00-00-12.134`
    - `viewer-state.startAnchor` 已指向該 slice
  - capture 分佈：
    - `get-after = 68`
    - `post-before = 21`
    - `post-after = 21`
  - `sampling/` 已輸出前 10 秒每秒一張：
    - `sample-00s.jpg` 到 `sample-09s.jpg`
- Decision: feasible

### FEEDBACK
- Positive: `timeline:build` 與 `timeline:prepare` 都過，代表這次雖然主流程大改，但 viewer 端仍能承接新 schema，另外也多了一組不依賴 HAR 的固定 sampling 參考圖。
- Negative: 目前驗證仍以 round1 為主，尚未確認其它 round 或不同登入入口是否都能穩定命中 baseline。
- Evidence: build/prepare 成功輸出、重建後 `timeline.json` / `round-meta.json` / `captures.json` 檢查結果。
- Next Run: 若接下來導入更多 round，優先驗證不同 URL prefix、不同 HTML content type 與多次登入情境。
