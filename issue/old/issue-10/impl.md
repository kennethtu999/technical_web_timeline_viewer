# Issue 10 - HAR Detail 改為 Tabs 並補上 Response Text

## Status

完成。

本檔記錄 `Response Text` 欄位、HAR detail tabs 與驗證結果。

## Task A - 擴充 HAR detail schema

- Goal: 補上專供閱讀本文的 `responseText` 欄位。
- Method:
  - 在 `prepare-rounds.mjs` 新增 `buildHarResponseText()`，只輸出 response body 主文。
  - `responseText` 延用既有的 decode / truncate 流程，避免和 `Response` 摘要顯示不一致。
  - 保留原本的 `response`，讓狀態資訊與 body 摘要仍可同時追溯。
- Evidence:
  - `npm run timeline:prepare`
  - `source/round1/viewer/timeline.json`
  - `apps/timeline-viewer/public/generated/round1/timeline.json`
  - `node` 檢查結果顯示 HAR event 已含 `detail.responseText`
- Decision: feasible

### FEEDBACK
- Positive: 把 `responseText` 在 prepare 階段先整理好後，前端只要讀欄位，不需要再自己拆 response summary，資料責任分界更清楚。
- Negative: `response` 與 `responseText` 都會帶 body 內容，`timeline.json` 體積會比上一版再大一點。
- Evidence: `buildHarResponseText()`、重建後的 round1 `timeline.json`、`timeline:prepare` 成功。
- Next Run: 若後續檔案體積開始成為負擔，可評估把 `response` 改成只保留 meta，將 body 完全交由 `responseText` 呈現。

## Task B - HAR detail 改為 Tabs

- Goal: 把 detail 內容改成 tab 切換形式，並預設聚焦回應本文。
- Method:
  - 在 `TimelineViewer.vue` 引入 `NTabs / NTabPane`，把 detail 改成 `Response Text / Response / Request / Header` 四個 tab。
  - 新增 `activeRequestDetailTab`，並在每次打開 detail 時自動 reset 為 `response-text`。
  - 保留既有「點同一筆收起、點另一筆切換」的 HAR item toggle。
- Evidence:
  - `npm run timeline:build`
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - build 成功，代表 tabs 與預設切換狀態可正常編譯。
- Decision: feasible

### FEEDBACK
- Positive: 預設直接落在 `Response Text` 後，人工驗證一打開就能先看本文，不需要先略過狀態資訊，閱讀動線更符合實際需求。
- Negative: panel 高度目前仍固定估值，若內容很長或 tab 標題之後再增加，可能還要再調整高度與捲動手感。
- Evidence: `TimelineViewer.vue` 的 tabs 結構與 `activeRequestDetailTab` reset、`timeline:build` 成功。
- Next Run: 若之後常需要比對 response meta，可評估把 `Response Text` 和 `Response` 的資訊密度再分得更清楚，例如把 Response 改成純 meta tab。

## Task C - 文件與 issue 同步

- Goal: 讓下一輪知道 HAR detail 現在的預設閱讀方式。
- Method:
  - 更新 root `README.md`，說明 HAR detail 現在改用 tabs，且預設停在 `Response Text`。
  - 更新 `apps/timeline-viewer/README.md`，補上 `Response Text` 的定位與目前限制。
  - 新增 `issue/issue-10/plan.md` 與回填本檔。
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-10/plan.md`
  - `issue/issue-10/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 這次把目前使用者真正會看到的預設行為寫進文件，下一輪不需要再從畫面猜「為什麼一打開停在 Response Text」。
- Negative: README 仍偏摘要型，若 detail tabs 再擴充，可能需要另外整理 interaction 規格。
- Evidence: README 入口與 viewer README 的 tabs 說明。
- Next Run: 若未來再新增 tab，可在 README 放一個簡短對照表，說明每個 tab 的用途與資料來源。

## Task D - 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare。
- Method:
  - 執行 `npm run timeline:build` 驗證前端編譯。
  - 執行 `npm run timeline:prepare` 驗證 `responseText` 可被重建進 round1 viewer 輸出。
  - 以 `node` 直接檢查首筆 HAR event 的 `detail.responseText`。
- Evidence:
  - `npm run timeline:build`
  - build 成功
  - `npm run timeline:prepare`
  - round1 實跑結果：
    - `Prepared round1: 82 slices / 146 HAR / 357 recording`
  - `node` 檢查輸出顯示 `har-1` 已含 `responseText`
- Decision: feasible

### FEEDBACK
- Positive: build 與 prepare 都過，代表這次不只 tabs UI 可編譯，連新的 `responseText` 欄位也真正落到 round 輸出。
- Negative: 這輪仍沒有直接在瀏覽器內做 tab 切換 smoke test，因此最終互動細節還是建議補一次人工點選確認。
- Evidence: `timeline:build` 成功、`timeline:prepare` 成功、`responseText` 檢查結果。
- Next Run: 開啟 viewer 實點幾筆 HAR，確認每次打開都停在 `Response Text`，且切到其它 tab 後內容沒有錯位。
