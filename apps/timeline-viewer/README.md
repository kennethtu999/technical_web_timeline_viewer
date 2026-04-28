# Timeline Viewer

這是 `縮圖 / HAR / Recording` 對齊用的 round-based timeline viewer。

## 技術選型

- `Node.js`
- `Vue 3`
- `Vite`
- `Naive UI`

## 功能範圍

- 左到右 timeline
- 三條水道：
  - thumbnail slices
  - request / response
  - recording steps
- 以 HAR-driven thumbnail slice 為主要切面
- slice group
  - 初始會先依交易代號自動建立 group
  - `TxPageHandler?taskID=...` 會切出新 group
  - `TxPageHandler?appID=...` 會先以功能大類建立 group
- `+/- offset ms`
- thumbnail hover preview
- focus preview 放大兩級
- 指定 `source/round{n}` 資料來源
- 右側 control panel：
  - round 選擇
  - `round_config.json` 文字編輯
  - 隱藏圖片
  - zoom / HAR URL regex / baseline 預設試轉
- `viewer-state.json` 本地持久化
  - `start / end anchor`
  - `hiddenSliceIds / offsets`
  - `zoom / requestUrlPattern`
  - `RESET` 可回到預設控制台狀態
- 點擊 HAR 卡片可在下方展開 detail panel
  - `Response Text`
  - `Response`
  - `Request`
  - `Header`
  - 預設打開 `Response Text`
  - 再點同一筆可收起
- JSF HAR 分類：
  - `document-get`
  - `document-post`
  - `ajax`

## 指令

在 repo root：

```bash
npm run timeline:round:add -- round2
npm run timeline:install
npm run timeline:prepare
npm run timeline:server
npm run timeline:dev
npm run timeline:round:restart -- round2
npm run timeline:round:remove -- round2
```

或在本目錄：

```bash
npm install
npm run prepare:rounds
npm run dev
```

注意：

- `timeline-viewer` 現在只負責前端畫面。
- `/api` 與 `/assets` 由 `apps/timeline-server` 提供。
- 本地開發時請先在 repo root 啟動 `npm run timeline:server`，再啟動 `npm run timeline:dev`。

## 資料來源

`prepare:rounds` 會掃描 `source/round*`，並對每個 round：

1. 直接驗證固定輸入檔：
   - `video.mp4`
   - `network.har`
   - `recording.json`
2. 從 `recording.title` 或 canonical 檔名推回 `video_start`
3. 以 `ffprobe` 取得影片長度，並以 `ffmpeg` 直接擷取縮圖
4. 依 HAR 規則建立 slice：
   - `GET`：`response + 0.5 秒`
   - `POST`：`request - 0.5 秒`、`response + 0.5 秒`
   - 目前只處理 `Content-Type` prefix 為 `text/htm` 的 `GET / POST`
5. 若存在 `source/baseline/page_login.jpg` 與 `source/round{n}/round_config.json`
   - 會用 `show_login_page` / `submit_login_page` 對齊登入流程
   - `submit_login_page.video_ms` 代表肉眼看到登入按鈕被按下的影片時間
   - 會用 submit HAR `POST` 的 `request-start - 0.5 秒` 推回有效影片起點
   - 選出的登入頁 slice 會標記為 `login-anchor`
   - baseline 圖會複製成 `thumbnails/login-anchor.jpg`
6. 輸出 round 內 viewer 資料：
   - `source/round{n}/artifacts/har-captures/captures.json`
   - `source/round{n}/artifacts/har-captures/sampling/*`
   - `source/round{n}/viewer/timeline.json`
   - `source/round{n}/viewer/viewer-state.json`
   - `source/round{n}/viewer/round-meta.json`
   - `source/round{n}/viewer/thumbnails/*`
7. viewer 直接讀 `source/round{n}/viewer/*`，縮圖與試轉圖由 `timeline-server` 透過 `/assets/rounds/round{n}/*` 提供

Round 管理建議流程：

1. 新增：
   - `npm run timeline:round:add -- round2`
   - 放入 `source/round2/video.mp4`、`source/round2/network.har`、`source/round2/recording.json`
   - 確認 `source/round2/round_config.json`
2. 重建：
   - `npm run timeline:round:restart -- round2`
   - 再跑 `npm run timeline:prepare`
   - 若要檢視 viewer，另外啟動 `npm run timeline:server` 與 `npm run timeline:dev`
3. 移除：
   - `npm run timeline:round:remove -- round2`

## 基礎版限制

- Recording 時間目前先用 heuristic mapping，因原始 JSON 沒有明確 step timestamp。
- HAR-driven 縮圖依賴 `video_start`，若起始時間有秒級誤差，整批截圖都會一起偏移。
- `POST after` 目前採用 `response + 0.5 秒` 推估，若畫面穩定時間較慢，仍可能需要人工回看。
- `ffmpeg -ss` 採用 input 前 seek，效率較好，但仍可能有些微關鍵幀誤差。
- `timeline-server` 目前用 `node --watch` 做 hot reload，本地開發可自動重啟；但 viewer 若遇到 API schema 變更，仍建議一起刷新頁面確認。
- 持久化目前走 `timeline-server`，可寫回 `source/round{n}/viewer/viewer-state.json`。
- baseline 試轉只會依目前 round 的 `round_config.json` 設定取圖，不會再改寫定位欄位。
- `RESET` 目前會把起終點、隱藏圖、offset、zoom 與 regex 一次回復預設值。
- 這版已支援多個 `round` 列表，但目前實際驗證資料仍以 `round1` 為主。
- HAR URL regex 使用 JavaScript regular expression；若 pattern 寫錯，UI 會提示錯誤並暫不套用 regex 過濾。
- HAR 明細目前在 `prepare:rounds` 階段先整理成字串摘要放入 `timeline.json`；若後續 round 量體持續放大，可能需要再改成懶載入。
- `Response Text` 會優先提供解碼、去除 HTML tag、並截斷後的 response 純文字，方便直接閱讀回應本文；`Response` 則保留狀態與 body 的完整摘要。
