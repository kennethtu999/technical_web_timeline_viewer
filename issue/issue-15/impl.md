# Issue 15 - Control Panel 精簡與 round_config 正式化

## Status

完成。

## Task A - 盤點現有 round / baseline config 讀取路徑

- Goal: 釐清 `page_login.json`、baseline trial、round metadata 與 control panel state 的實際使用點。
- Method:
  - 盤點 `TimelineViewer.vue`、`useTimelineModel.js`、`server-web.mjs`、`prepare.js`、`prepare/shared.js`、`scripts/manage-rounds.mjs`。
  - 確認舊流程同時把 login 設定放在 `source/baseline/page_login.json`，而 UI 又另外暴露 baseline 試轉秒數與多時間點輸入。
  - 確認 round 初始化流程本來不會補 `round_config.json`，system 與 round 的責任邊界不存在。
- Evidence:
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-server/src/server-web.mjs`
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/src/lib/prepare/shared.js`
  - `scripts/manage-rounds.mjs`
- Decision: feasible

### FEEDBACK

- Positive: 先把舊讀寫點盤清楚後，能確定這次不是單純刪幾個 UI 欄位，而是要一起補 config API 與 round 初始化補檔流程。
- Negative: `baseline` 一詞在現有程式裡同時代表登入代表圖與登入規則設定，命名包袱仍在，這輪只先把外部流程切正。
- Evidence: 上述檔案中的 `page_login.json`、`/api/baseline/page-login`、baseline trial 秒數欄位與 `timeline:round:add` 流程。
- Next Run: 若後續還要再收斂責任，可再把程式內部 `baseline` 命名拆成 `baselineImage` 與 `roundConfig` 兩條線。

## Task B - 調整 round / system config 命名與預設補檔流程

- Goal: 讓每個 round 都能穩定取得自己的 `round_config.json`，並在缺檔時回退到系統 default config。
- Method:
  - 在 `prepare/shared.js` 新增 `DEFAULT_SYSTEM_ID`、`ROUND_CONFIG_FILE`、`ensureSystemDefaultConfig()`、`ensureRoundConfig()`、`buildRoundKey()`。
  - round 改由目錄名稱直接識別 system，例如 `megageb_round1` 直接推導 `system_id=megageb`，不再使用 `round1 -> esbgib` mapping。
  - `prepare.js` 改成讀 `source/round{n}/round_config.json`，若缺檔就從 `source/baseline/esbgib_round_default.json` 複製。
  - 新增 `/api/rounds/:roundId/config` GET/POST，提供前端直接讀寫 round config。
  - `timeline:round:add` 建 round 時同步補一份 `round_config.json`。
  - 實際新增 `source/baseline/esbgib_round_default.json` 與 `source/megageb_round1/round_config.json`，並移除舊 `source/baseline/page_login.json`。
- Evidence:
  - `apps/timeline-server/src/lib/prepare/shared.js`
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/src/server-web.mjs`
  - `scripts/manage-rounds.mjs`
  - `source/baseline/esbgib_round_default.json`
  - `source/megageb_round1/round_config.json`
  - `source/megageb_round1/viewer/round-meta.json`
- Decision: feasible

### FEEDBACK

- Positive: 先做 system default 再做 round 覆寫後，設定責任變得可追溯，也讓 textarea 編輯有明確落點。
- Negative: 目前若某系統沒有對應 `source/baseline/{systemId}_round_default.json`，初始化新 round 仍會失敗，需先補 baseline default。
- Evidence: `ensureRoundConfig()`、`inferRoundSystemId()`、`source/megageb_round1/round_config.json`、`round-meta.json` 的 `systemId / roundKey`。
- Next Run: 若多系統 round 會持續新增，建議補一個「建立系統 baseline default」的檢查/引導流程。

## Task C - 精簡 Control Panel UI

- Goal: 移除目前不再需要的控制項，保留 round 選擇、round config 編輯與必要的 baseline 試轉能力。
- Method:
  - `TimelineViewer.vue` 移除 `Groups`、`Workspace Stats`、`HAR Kinds`、`Start Point`、`End Point`、`Mode Hint` 區塊。
  - round 選單改成依顯示名稱排序。
  - 在 round 選單下新增 `Round Config` textarea 與儲存按鈕。
  - `Baseline Trial` 改成只顯示 `submit_login_page.video_ms`、`試轉預設值`、`全部套用`，不再提供開始秒數、結束秒數、多時間點 textarea。
  - `useTimelineModel.js` 新增 `loadRoundConfig()` / `saveRoundConfig()`，並把隱藏的 group filter 與 HAR kinds 在載入時回到預設值，避免舊 state 偷偷影響畫面。
- Evidence:
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/src/App.vue`
- Decision: feasible

### FEEDBACK

- Positive: 把 round config 直接放到 round 選擇下方後，使用者不用再在 baseline 檔與控制台之間切換，操作路徑明顯縮短。
- Negative: 這輪只把多餘控制項從 UI 拿掉，內部仍保留部分舊 state/schema 欄位以維持相容，結構還不算完全瘦身。
- Evidence: `TimelineViewer.vue` 中新的 `Round Config` 區塊、刪除的 control sections、`runBaselinePreview()` 改用固定預設值。
- Next Run: 若確認這些舊欄位不會再回來，可再把 `viewer-state` schema 裡的 group filter / HAR kinds 一併移除。

## Task D - 驗證與 issue 記錄

- Goal: 確認主要流程仍可運作，並把結果、限制與 FEEDBACK 寫入本檔。
- Method:
  - 執行 `npm run build` 驗證 viewer build。
  - 執行 `npm test` 驗證 timeline-server 測試。
  - 執行 `npm run prepare:rounds -- megageb_round1` 重建 round，確認新 config 流程可實際 prepare。
  - 更新 `README.md`、`apps/timeline-server/README.md`、`apps/timeline-viewer/README.md` 與本 issue 紀錄。
- Evidence:
  - `apps/timeline-viewer` `npm run build`
  - `apps/timeline-server` `npm test`
  - `apps/timeline-server` `npm run prepare:rounds -- megageb_round1`
  - `README.md`
  - `apps/timeline-server/README.md`
  - `apps/timeline-viewer/README.md`
- Decision: feasible

### FEEDBACK

- Positive: 這輪把 build、test、實際 prepare 都跑過，能確認不是只停在 UI 改名而已，後端 prepare 流程也真的吃到 `round_config.json`。
- Negative: `apps/timeline-viewer/public/generated/*` 仍保留舊產物，這輪主流程已改走 `timeline-server`，但靜態 generated 資料尚未同步重整。
- Evidence: viewer build 成功；server 測試 4/4 通過；`megageb_round1` prepare 成功並重寫 `source/megageb_round1/viewer/round-meta.json`。
- Next Run: 若還要保留 `public/generated` 作為備援輸出，應補一條同步產生新 metadata 的流程；否則可考慮正式標記為歷史產物。
