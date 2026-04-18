# Issue 12 - HAR 時間點驅動截圖（ffmpeg 純 Node 流程）

本 issue 目標是把目前 `prepare-rounds.mjs` 依賴的 `Python + scenedetect + manifest.json` 流程，收斂成 `Node.js + ffmpeg/ffprobe + HAR 時間點` 的正式 prepare 路線，讓截圖時間直接對齊 HAR 事件，而不是對齊場景切換。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前正式流程仍依賴：

- `tools/video-to-images/screenshot.py`
- `scenedetect`
- `manifest.json`

這條路線有三個核心問題：

- 需要額外 Python 環境與套件，正式流程依賴較重。
- 截圖來源是「場景變化」，不是「HAR 關鍵事件」，三方對齊需要再推回時間。
- `prepare-rounds.mjs` 與 viewer 目前吃的是 scene slice 語意，登入錨點與 HAR 關鍵頁面仍混在人工判讀流程中。

這次要改成：

- 由 HAR 事件直接決定取圖時間點
- 由 `ffmpeg` 直接萃取縮圖
- 由 `ffprobe` 提供影片長度
- 由 `source/baseline/` 提供全域登入錨點素材

## 2. 本次明確方案

### 2.1 登入錨點來源改為全域 baseline

登入錨點不再使用每個 round 自帶的 `login-anchor.json`，改為讀取 `source/baseline/` 下的固定檔案：

- `source/baseline/page_login.jpg`
- `source/baseline/page_login.json`

規則如下：

- `page_login.json` 目前至少包含：
  - `video_offset_ms`
  - `show_login_page`
  - `submit_login_page`
- `show_login_page` 表示登入頁顯示時對應的 HAR request 規則。
- `submit_login_page` 表示登入送出時對應的 HAR request 規則。
- `submit_login_page.recording.click.string` 可提供 Recording 提示字串，幫助從多次登入流程中選出主要 submit。
- `submit_login_page.recording.click.order` 可指定第幾次命中的 click 才算主要 submit。
- prepare 會先用 HAR 找 `submit_login_page`，再回推最後一個對應的 `show_login_page` 當登入開始點。
- 若 `page_login.jpg` 存在，prepare 會直接複製成 round viewer 縮圖中的登入代表圖，例如 `thumbnails/login-anchor.jpg`。
- 這個 baseline 是全域共用素材，不要求每個 round 再各自補檔。

備註：

- `video_offset_ms` 會加到推回的 `video_start`，作為更精細的人工校正值。
- 未來若登入入口有多組 host、path 或 query variation，可直接擴充 JSON schema。

### 2.2 HAR 事件篩選規則

本輪 HAR-driven 截圖先只處理 `GET / POST` 且回應 `Content-Type` 命中 `text/htm` prefix 的事件。

實務判定方式：

- 讀取 HAR `response.content.mimeType`
- 以不分大小寫方式判斷是否以 `text/htm` 開頭
- 因此可涵蓋：
  - `text/html`
  - `text/html; charset=Big5`
  - 其它以 `text/htm...` 開頭的變體

本輪不納入：

- `ajax`
- `application/json`
- 圖片、CSS、JS、下載類 response

備註：

- 此規則必須實作成可調整函式或集中設定，保留未來擴充彈性。
- 本輪先以「HTML 畫面型 response」為主，避免一開始就把事件量放太大。

### 2.3 取圖時點規則

同一筆 HAR 事件可產生 1 到 2 張候選圖，依 method 決定：

- `GET`
  - 取圖時間點：`responseReceivedAt + 0.5 秒`
- `POST`
  - 取圖時間點 A：`requestStartedAt - 0.5 秒`
  - 取圖時間點 B：`responseReceivedAt + 0.5 秒`

時間欄位定義：

- `requestStartedAt = new Date(entry.startedDateTime).getTime()`
- `responseReceivedAt = requestStartedAt + entry.time`

邊界處理：

- 若 offset `< 0`，跳過該候選圖。
- 若 offset `> videoDurationMs`，跳過該候選圖。
- 若 HAR 缺少有效 `startedDateTime` 或 `entry.time` 無法換算，跳過並記錄原因。

縮圖命名建議：

- `har-{index}-get-after.jpg`
- `har-{index}-post-before.jpg`
- `har-{index}-post-after.jpg`

備註：

- `POST` 前後各取一張，是為了同時保留「送出前表單畫面」與「送出後畫面結果」。
- 未來若要更彈性，可把 `+/- 0.5 秒` 抽成集中常數或 round-level 設定。

### 2.4 Slice 定義

本輪 slice 不再來自 `manifest.captures`，改為 HAR 事件候選圖本身。

建議 slice schema 至少包含：

- `id`
- `harEntryIndex`
- `captureKind`
  - `get-after`
  - `post-before`
  - `post-after`
- `method`
- `url`
- `pathname`
- `requestStartedAt`
- `responseReceivedAt`
- `captureAt`
- `offsetMs`
- `durationMs`
- `thumbnailSrc`
- `pageHint`
- `groupIds`

其中：

- `captureAt` 是實際要交給 `ffmpeg -ss` 的時間點。
- `durationMs` 不能留空，至少需有 viewer 可顯示的最小區間語意。
- 若同一 HAR 事件產生多張圖，必須保留 `captureKind` 區分前後狀態。

### 2.5 同秒去重規則

本輪需加入最小去重保護，但不能只做「同秒只留一張」的粗暴規則。

明確方案：

- 預設以 `Math.floor(captureAt / 1000)` 作為秒桶。
- 同一秒、同一 `captureKind`、同一 `pathname` 的重複候選圖，只保留第一張。
- 不同 `captureKind` 不互相覆蓋。
- `POST before` 與 `POST after` 必須保留，不可互相去重。
- baseline URL 命中的登入錨點不可被一般去重規則吃掉。

備註：

- 這樣可以先擋掉連續重覆 GET，又不會把 submit 前後的關鍵畫面消掉。

## 3. 執行項目

### Task A. 移除 Python 正式依賴，改由 Node + ffmpeg/ffprobe 取圖

- Goal: 讓 `prepare-rounds.mjs` 正式流程不再依賴 `screenshot.py` 與 `manifest.json`。
- 預期輸出：
  - 新增 `extractFrameByOffset(videoPath, offsetSec, outputPath)`
  - 呼叫 `spawnSync("ffmpeg", ["-ss", offsetSec, "-i", videoPath, "-frames:v", "1", "-q:v", "2", outputPath])`
  - 新增 `probeVideoDurationMs(videoPath)`，透過 `ffprobe -v quiet -print_format json -show_format`
  - `runScreenshotTool()` 改為 HAR-driven 流程函式

### Task B. 依 HAR 規則建立 capture candidates 與 slices

- Goal: 用 HAR 事件直接產生縮圖與 slice，而不是讀 scene manifest。
- 預期輸出：
  - 只篩 `GET / POST` 且 `Content-Type` prefix 為 `text/htm`
  - `GET` 產生 `responseReceivedAt + 0.5 秒`
  - `POST` 產生 `requestStartedAt - 0.5 秒` 與 `responseReceivedAt + 0.5 秒`
  - 產出新版 `buildSliceMapFromHar(...)`
  - 超界、缺值、重複候選圖可跳過並留下理由

### Task C. 以 `source/baseline` 自動建立登入錨點

- Goal: 讓 prepare 自動把 baseline 登入圖與 URL 規則掛進 timeline。
- 預期輸出：
  - 讀取 `source/baseline/page_login.json`
  - 讀取 `source/baseline/page_login.jpg`
  - 依 `show_login_page` / `submit_login_page` 選出登入 anchor
  - 建立 `group-login-anchor`
  - 複製 baseline 圖到 viewer thumbnails 供登入錨點顯示

### Task D. 調整 prepare 主流程與 metadata

- Goal: 讓 `timeline.json` / `round-meta.json` 承接 HAR-driven slice 語意。
- 預期輸出：
  - `detectRoundInputs()` 不再要求每 round 另附 login anchor 檔
  - `round-meta.json` 新增 baseline / login anchor 來源資訊
  - `rawSceneCount` 改為 `null`
  - `skippedOverlapCount` 改為 `null`
  - viewer 仍能正常讀取 slice、groups、縮圖

### Task E. 文件與 issue 同步

- Goal: 讓下一輪知道正式 prepare 流程已改為 HAR-driven。
- 預期輸出：
  - `README.md`
  - `tools/video-to-images/README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-12/impl.md`

### Task F. 驗證

- Goal: 確認 HAR-driven prepare 之後，viewer 與 round1 可正常使用。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - round1 縮圖數量與 HAR 候選事件數可對上
  - baseline login anchor 出現在正確起點

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

1. `timeline:prepare` 正式流程不再依賴 `screenshot.py`。
2. HAR 截圖規則明確落實為：
   - GET 接收後 `0.5 秒`
   - POST 送出前 `0.5 秒`
   - POST 接收後 `0.5 秒`
3. 僅處理 `GET / POST` 且 `Content-Type` prefix 為 `text/htm` 的事件。
4. `source/baseline/page_login.json` 可驅動登入頁與登入送出的對齊。
5. `source/baseline/page_login.jpg` 可成為 viewer 中的登入代表圖。
6. `timeline:build` 與 `timeline:prepare` 成功。

## 6. 風險

- `video_start` 若有秒級誤差，所有 HAR 驅動截圖都會整段偏移。
- `POST after` 仍是以 HAR 回應完成後 `0.5 秒` 推估，不保證剛好是最終畫面穩定瞬間。
- `ffmpeg -ss` 放在 input 前雖有效能優勢，但關鍵幀 seek 可能帶來些微時間誤差。
- 同秒去重若規則過寬，仍可能吃掉 redirect chain 或相鄰關鍵頁。
- baseline config 目前仍是單一登入流程設定；若未來有多環境或多登入入口，需要再擴充 schema。
- `rawSceneCount` / `skippedOverlapCount` 改為 `null` 後，需確認 viewer 與文件不再把它們當成 scene-based 指標解讀。

## 7. 驗收重點

本 issue 驗收時，優先確認：

- `page_login.json` 是否真的能把登入起點抓到正確的 show/submit 流程
- `GET / POST` 的三種取圖時機是否都正確落實
- 同秒去重是否保留了 `POST before / POST after` 的關鍵畫面
- viewer 中 slice 與 HAR/Recording 的對應是否仍可閱讀
- 文件、issue、實際輸出資料三者語意是否一致
