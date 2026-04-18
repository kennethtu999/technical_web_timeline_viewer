# Issue 14 - Timeline Panel 精簡與 Recording 群組操作

本 issue 目標是把 `Timeline Panel` 從「每個 slice 都各畫一張控制卡」改成較精簡的操作方式，讓實際驗證時可以在同一頁看更多內容，同時保留必要的群組與 recording 微調能力。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 timeline viewer 已可同時檢視 thumbnails、HAR、recording 與 groups，但 `Offset / Groups / Recording` 這三個水道都偏向「逐 slice 卡片式」呈現，產生三個問題：

- `Offset` 水道獨立占一列，高度成本高。
- `Groups` 目前每個 slice 都有 `+ / -` 卡片，命名能力不足，也太占畫面。
- `Recording` 以逐 slice 堆卡片顯示，同一頁或同一組 recording 很容易重複展開，閱讀密度偏低。

這次先做最小修復，不先重做後端資料格式；以 viewer 端重新整理呈現與互動為主。

## 2. 本次明確方案

### 2.1 移除 Offset 水道

- `Timeline Panel` 不再顯示獨立 `Offset` 水道。
- 既有 offset 資料結構先保留，避免影響已存 viewer state。

### 2.2 Groups 改成小型點標記

- `Groups` 改為小型 dot marker，不再用大卡片顯示。
- 點 marker 後可建立群組或修改群組名稱。
- 新建群組時要有預設值，降低操作成本。

### 2.3 Recording 改成同頁清單群組

- 把連續且內容相同的 recording events 合併成同一個 recording group。
- 每個 group 以清單方式顯示，減少重複卡片占用。

### 2.4 Recording group 狀態

- 每個 recording group 可設定：
  - `Hide`
  - `Shift Left`
  - `Shift Right`
- `Hide` 只影響該 group 自己，不重排後面的 recording groups。

## 3. 執行項目

## Task A. 重整 viewer model 的 group / recording 摘要層

- Goal: 在不改 server 資料格式下，於前端建立可支撐新 UI 的摘要資料。

## Task B. 更新 Timeline Panel UI

- Goal: 移除 Offset 水道，改為小型 group marker 與 compact recording list。

## Task C. 驗證與 issue 記錄

- Goal: 確認 viewer build 可通過，並把限制與 FEEDBACK 寫回 issue。

## 4. 成功標準

本 issue 若要算成功，至少需滿足：

1. `Offset` 水道不再出現在 Timeline Panel。
2. `Groups` 可用小型 marker 建立與命名。
3. `Recording` 可把同頁內容合併成群組清單。
4. `Recording group` 可切換 `Hide / Shift Left / Shift Right`。
5. 異動結果與限制有記錄在 `issue/issue-14/impl.md`。
