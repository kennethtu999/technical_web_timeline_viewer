# Issue 3 - Timeline Viewer 基礎版

本 issue 聚焦建立一個可用來對齊 `縮圖 / HAR / Recording` 的基礎版 timeline viewer，定位是 `POC viewer`，先回答「這種互動式對照介面值不值得繼續做」，不是一次做完最終產品。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前專案已完成：

- 影片切圖工具整理，可產生 `manifest.json` / `manifest.csv`
- HAR 與 Recording 原始素材確認
- 登入頁三方對齊已有初步可行證據

下一步需要一個基礎版 viewer，把三種資料放進同一條可水平比對的 timeline，讓人工對齊、分群、微調 offset 更有效率。

## 2. 目標

本 issue 要建立：

1. `Node.js + Vue 3` 的基礎版系統。
2. 左到右 timeline。
3. 三條水道：
   - 縮圖
   - 請求與回覆
   - Recording 內容
4. 以縮圖 slice 作為主要切面。
5. 支援多個 slice 組成 group。
6. 支援 slice 間插入 `+/- offset ms`。
7. 縮圖 hover 時顯示較大圖片。
8. 使用合適 design system，風格保持簡約。
9. 提供一條指令完成影片切圖與 viewer data 準備。
10. 先完成基礎版，不先做完整產品化。
11. HAR 分類要能先支援 JSF 系統常見的：
   - `document-get`
   - `document-post`
   - `ajax`

## 3. 執行項目

### Task A. 建立 viewer 專案骨架

- Goal: 建立可執行的 `Vue 3 + Vite + Node.js` 基礎架構。
- 預期輸出：
  - `apps/timeline-viewer/package.json`
  - `apps/timeline-viewer/src/*`

### Task B. 建立 timeline 三條水道 UI

- Goal: 讓使用者可在同一畫面左右比對 slice / request-response / recording。
- 預期輸出：
  - `timeline-viewer` 基礎畫面
  - slice hover preview
  - group / offset 基礎互動

### Task C. 建立資料準備腳本

- Goal: 把影片切圖、HAR、Recording 轉成 viewer 可直接讀取的資料。
- 預期輸出：
  - `prepare-round1.mjs`
  - app-ready `timeline.json`

### Task D. 定義 JSF HAR 分類規則

- Goal: 先把 HAR 分成 `document-get / document-post / ajax` 三類。
- 預期輸出：
  - `jsf-request-kind-rule`
  - `timeline request lane` 資料格式

### Task E. 建立一條指令流程與文件

- Goal: 讓 `video -> thumbnails -> viewer data` 可以一條指令跑完。
- 預期輸出：
  - root npm scripts
  - viewer README

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

1. viewer 專案骨架可成立。
2. timeline 三條水道可顯示。
3. slice 可作為主要切面。
4. 至少能展示 group 與 offset 的基礎互動。
5. 存在一條可執行的資料準備指令。
6. HAR 可先以 JSF 規則切成三類事件。

## 6. 風險

- Recording 原始 JSON 沒有明確時間戳，viewer 可能只能先用 heuristic mapping。
- 全量 thumbnail 很多，基礎版可能先以可滾動 timeline 處理，未必立即最佳化效能。
- offset / group 互動先求可用，不先做完整持久化。

## 7. 驗收重點

本 issue 驗收重點是：

- viewer 這條路線是否值得做
- 是否能明顯降低人工對齊成本
- 哪些功能已足夠 POC，哪些仍需下一輪工程化
