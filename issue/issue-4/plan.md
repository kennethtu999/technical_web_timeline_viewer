# Issue 4 - Round 管理與人工校正控制台

本 issue 延續 [issue-3](../issue-3/plan.md) 的 timeline viewer 成果，聚焦把 viewer 從「可展示」推進到「可整理 round 資料、可人工校正、可把操作落到 round 目錄」的 POC 第二版。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

Issue 3 已證明：

- `thumbnail / HAR / Recording` 放在同一條 timeline 是可行路線
- `Vue 3 + Vite` viewer 骨架可成立
- `group / offset / hover preview` 已有基礎版

但目前仍有幾個 POC 缺口：

- viewer 仍寫死 `round1`
- 所有 viewer 產出沒有回到 `source/round{n}` 管理
- `video / har / recording` 檔名未拉齊
- 缺少人工設定起點 / 結束點 / 隱藏圖的 control panel
- offset 入口仍散在 inspector，辨識不夠直觀

## 2. 目標

本 issue 要建立：

1. round-based 輸出結構，所有 viewer 產出回到 `source/round{n}`。
2. `video / har / recording` 的對齊命名機制。
3. viewer 可選擇 `source` 目錄下的指定 round。
4. 上方保留 timeline 專用空間，右側改成 control panel。
5. control panel 支援：
   - 設定起始點
   - 設定結束點
   - 清除起始點
   - 清除結束點
   - 隱藏圖片
6. offset 改放到 timeline 上方，並能明確辨識非零 offset。
7. 畫面上的設定結果可落到 `source/round{n}/viewer/viewer-state.json`。

## 3. 執行項目

### Task A. 建立 round-based 資料輸出

- Goal: 把 viewer 所需輸出集中到 `source/round{n}`，並保留 app 可直接讀取的鏡像資料。
- 預期輸出：
  - `source/round1/viewer/timeline.json`
  - `source/round1/viewer/viewer-state.json`
  - `source/round1/viewer/round-meta.json`
  - `apps/timeline-viewer/public/generated/index.json`

### Task B. 建立 canonical file alias

- Goal: 讓每個 round 目錄都有固定名字的 `video / har / recording` 入口。
- 預期輸出：
  - `source/round1/video.mp4`
  - `source/round1/network.har`
  - `source/round1/recording.json`

### Task C. viewer 支援 round selector 與 control panel

- Goal: 使用者可在 UI 中切換 round、操作起始點 / 結束點 / 隱藏圖 / group / filter / zoom。
- 預期輸出：
  - round selector
  - right-side control panel
  - timeline top offset lane

### Task D. 建立 viewer-state 持久化

- Goal: 在本地 dev 模式下，把 UI 操作結果回寫到 round 目錄。
- 預期輸出：
  - Vite local API / middleware
  - `viewer-state.json` 自動更新

### Task E. 文件同步

- Goal: 更新 README、viewer README 與 issue 紀錄，讓下一輪接手成本降低。
- 預期輸出：
  - root `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-4/impl.md`

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

1. viewer 輸出已落到 `source/round{n}`。
2. 存在固定命名的 `video / har / recording` 管理入口。
3. UI 可切換指定 round。
4. 上方 timeline 區與右側 control panel 已分工清楚。
5. 起始點 / 結束點 / 隱藏圖 / offset 皆可操作。
6. `viewer-state.json` 存在且格式可承接後續人工校正。

## 6. 風險

- Vite dev middleware 可支援本地寫檔，但 production build 仍會回到唯讀模式。
- Recording 時間仍沿用 heuristic mapping，起始點 / 結束點是人工校正輔助，不代表已解決所有時間對齊問題。
- 若未來 round 數量變多，縮圖量與前端渲染效能仍需下一輪觀察。

## 7. 驗收重點

本 issue 驗收重點是：

- round 資料是否真的更好管理
- control panel 是否足夠支撐人工校正
- viewer 操作結果是否已開始沉澱成可追溯的 round 內資料
