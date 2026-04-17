# Issue 8 - Control Panel 持久化補齊與 RESET 機制

本 issue 承接目前已可寫回 `viewer-state.json` 的 round-based viewer，聚焦把尚未持久化的 `zoom / group filter / HAR kinds / HAR URL regex` 收斂進同一份 state，並補上一個可安全回復預設值的 `RESET` 機制，避免人工整理途中重整頁面後又要重設一次。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 `Control Panel` 雖已有多個操作項目，但持久化範圍仍只包含：

- `startAnchor`
- `endAnchor`
- `hiddenSliceIds`
- `offsets`

這代表下列狀態在重新整理頁面或重新開啟 round 後仍會遺失：

- `zoom`
- group multiple select filter
- HAR kinds filter
- HAR URL regex filter

另外目前也沒有單一入口可以把人工校正狀態回到乾淨初始值，若要重新檢查同一個 round，仍需逐項手動清掉，增加試錯成本。

## 2. 目標

本 issue 要回答：

1. `Control Panel` 的主要篩選與檢視設定是否可以一併持久化到 `viewer-state.json`。
2. 是否能提供一個明確的 `RESET` 機制，讓使用者快速回到預設檢視狀態。
3. `prepare`、dev middleware 與 README 是否已同步同一份 state 契約。

## 3. 執行項目

### Task A. 擴充 viewer-state 契約

- Goal: 把常用的控制台檢視設定納入同一份持久化 state。
- 預期輸出：
  - `viewer-state.json` 新增 `zoom`
  - `viewer-state.json` 新增 `selectedGroupIds`
  - `viewer-state.json` 新增 `requestKindFilter`
  - `viewer-state.json` 新增 `requestUrlPattern`
  - 前端讀取時會套用既有值，而不是每次回到預設

### Task B. 補上 RESET 機制

- Goal: 提供一個明確且一致的重設入口。
- 預期輸出：
  - `Control Panel` 新增 `RESET` 按鈕
  - reset 後可回到 viewer 預設狀態
  - reset 不需逐項手動清除

### Task C. 同步 prepare / dev / 文件

- Goal: 避免不同入口對 `viewer-state` 的預設格式理解不一致。
- 預期輸出：
  - `prepare-rounds.mjs` 同步新版 state schema
  - `vite.config.js` 同步新版 state schema
  - `README.md` 與 `apps/timeline-viewer/README.md` 補上持久化範圍與 RESET 說明

### Task D. 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare，並留下證據與 FEEDBACK。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - `issue/issue-8/impl.md`

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

1. `zoom / group filter / HAR kinds / HAR URL regex` 已納入 `viewer-state.json`。
2. `RESET` 可讓目前 round 回到預設控制台狀態。
3. `prepare` 與 dev middleware 對新版 `viewer-state` 都能正確承接。
4. README 與 issue 紀錄已同步更新。

## 6. 風險

- 舊的 `viewer-state.json` 沒有新欄位，需保留 backward-compatible fallback。
- `selectedGroupIds` 若對到不存在的 group，需在載入時自動回到 `全部`。
- `RESET` 若直接清掉所有資料，使用者可能誤操作，因此需明確定義重設範圍。
- production build 仍偏唯讀，無法把本地持久化視為所有部署模式都支援。

## 7. 驗收重點

本 issue 驗收重點是：

- 重新整理後控制台是否能回到上次設定
- reset 是否能明確回到預設值
- viewer-state 契約是否仍足夠簡單、可追蹤
- 文件是否能讓下一輪知道哪些設定會被保存、哪些不會
