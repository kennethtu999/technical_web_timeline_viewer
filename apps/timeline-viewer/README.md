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
- 以 thumbnail slice 為主要切面
- slice group
- `+/- offset ms`
- thumbnail hover preview
- focus preview 放大兩級
- 指定 `source/round{n}` 資料來源
- 右側 control panel：
  - 起始點
  - 結束點
  - 隱藏圖片
  - group / zoom / filter
- `viewer-state.json` 本地持久化
  - `start / end anchor`
  - `hiddenSliceIds / offsets`
  - `zoom / selectedGroupIds`
  - `requestKindFilter / requestUrlPattern`
  - `RESET` 可回到預設控制台狀態
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

## 資料來源

`prepare:rounds` 會掃描 `source/round*`，並對每個 round：

1. 直接驗證固定輸入檔：
   - `video.mp4`
   - `network.har`
   - `recording.json`
2. 呼叫 `tools/video-to-images/screenshot.py` 產生 / 更新縮圖與 manifest
   - 預設會套用 `50% overlap` 卷動去重規則
3. 輸出 round 內 viewer 資料：
   - `source/round{n}/viewer/timeline.json`
   - `source/round{n}/viewer/viewer-state.json`
   - `source/round{n}/viewer/round-meta.json`
   - `source/round{n}/viewer/thumbnails/*`
4. 同步鏡像到 app `public/generated/{round}`

Round 管理建議流程：

1. 新增：
   - `npm run timeline:round:add -- round2`
   - 放入 `source/round2/video.mp4`、`source/round2/network.har`、`source/round2/recording.json`
2. 重建：
   - `npm run timeline:round:restart -- round2`
   - 再跑 `npm run timeline:prepare`
3. 移除：
   - `npm run timeline:round:remove -- round2`

## 基礎版限制

- Recording 時間目前先用 heuristic mapping，因原始 JSON 沒有明確 step timestamp。
- 縮圖去重目前依賴垂直卷動 overlap heuristic；對 sticky header、局部內容更新或動畫干擾的頁面，仍可能需要人工回看 `skipped_captures`。
- 持久化目前走 Vite dev middleware，本地開發可寫回 `source/round{n}/viewer/viewer-state.json`；production build 仍以唯讀檢視為主。
- `RESET` 目前會把起終點、隱藏圖、offset、zoom、group filter、HAR kinds 與 regex 一次回復預設值。
- 這版已支援多個 `round` 列表，但目前實際驗證資料仍以 `round1` 為主。
- HAR URL regex 使用 JavaScript regular expression；若 pattern 寫錯，UI 會提示錯誤並暫不套用 regex 過濾。
