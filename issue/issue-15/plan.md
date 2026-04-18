# Issue 15 - Control Panel 精簡與 round_config 正式化

本 issue 目標是把 `Control Panel` 收斂成目前實際驗證會用到的最小操作集，並把原本偏向 baseline login 的設定流程改成「每個系統有預設 config、每個 round 有自己 config」的正式 round 設定模式。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 viewer 與 prepare 流程的設定責任分散在幾個地方：

- `Control Panel` 仍保留 `Groups`、`Workspace Stats`、`HAR Kinds`、`Start Point / End Point`、baseline trial 多個時間欄位等過去測試階段功能。
- baseline login 設定仍使用 `page_login.json` 命名，語意偏向單一登入頁，不適合承接 round 的完整排除與流程設定。
- round 與 system 的對應關係尚未正式化，導致不同 round 若要共用同系統預設值，缺少穩定入口。

這次調整先以支撐實際驗證作業為主，不先擴大成大型設定平台；重點是讓操作更直覺、round config 更可追溯。

## 2. 本次明確方案

### 2.1 Control Panel 精簡

- 在 `round` 選擇器下方新增 `textarea`，允許直接編輯目前 round 的 `round_config.json` 內容。
- `round` 下拉改成依名稱排序。
- 移除 `Groups` 選擇。
- 移除 `Workspace Stats` 區塊。
- `Baseline Trial` 改為簡化排版：
  - 拿掉多時間點 `textarea`
  - 拿掉試轉開始秒數
  - 拿掉試轉結束秒數
  - 改用預設值執行
- 移除 `HAR Kinds` 控制項。
- 移除 `Start Point / End Point` 控制項。

### 2.2 round / system config 正式化

- 目前 `round1` 的系統別定為 `esbgib`。
- 每個 round 都必須對應一個系統別，round key 採 `{systemId}_round_{number}` 格式。
- 原本 `page_login.json` 改名為 `round_config.json`。
- 每個系統都可有自己的預設設定：`{systemId}_round_default.json`。
- 每個 round 都有自己的 `round_config.json`。
- 若 round 初始化時沒有 `round_config.json`，就從該系統的 default config 複製一份。

### 2.3 相容與限制

- 本輪先以最小修復為主，優先維持既有流程可用。
- 若現有資料夾或 API 仍暫時依賴舊命名，需要在實作中記錄相容策略與殘留限制。

## 3. 執行項目

## Task A. 盤點現有 round / baseline config 讀取路徑

- Goal: 釐清 `page_login.json`、baseline trial、round metadata 與 control panel state 的實際使用點。

## Task B. 調整 round / system config 命名與預設補檔流程

- Goal: 讓每個 round 都能穩定取得自己的 `round_config.json`，並在缺檔時回退到系統 default config。

## Task C. 精簡 Control Panel UI

- Goal: 移除目前不再需要的控制項，保留 round 選擇、round config 編輯與必要的 baseline 試轉能力。

## Task D. 驗證與 issue 記錄

- Goal: 確認主要流程仍可運作，並把結果、限制與 FEEDBACK 寫入 `impl.md`。

## 4. 任務定位

本輪任務屬於：

- 正式流程維運與修正
- 風險釐清

## 5. 成功標準

本 issue 若要算成功，至少需滿足：

1. `Control Panel` 已移除本輪列為不用的欄位與區塊。
2. `round` 選單依名稱排序。
3. `round` 下方可直接編輯 `round_config.json`。
4. `page_login.json` 已改為 `round_config.json` 的正式流程語意。
5. round 與 system default config 的對應與補檔流程明確可追溯。
6. `issue/issue-15/impl.md` 有完整結果、限制與 FEEDBACK。
