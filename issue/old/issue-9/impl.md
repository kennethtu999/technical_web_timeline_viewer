# Issue 9 - HAR 項目展開 Request/Response/Header 明細

## Status

完成。

本檔記錄 HAR 明細資料補齊、detail panel 展開邏輯、驗證結果與 FEEDBACK。

## Task A - 擴充 HAR event 明細資料

- Goal: 讓 timeline.json 內的 HAR event 能提供 panel 所需的 request / response / header 文字摘要。
- Method:
  - 在 `prepare-rounds.mjs` 新增 HAR detail helper，將 request、response、headers 整理成可直接顯示的字串。
  - 對 request / response body 補上截斷邏輯，避免大內容直接把 `timeline.json` 撐太大。
  - 對 response content 的 base64 編碼補上解碼 fallback，避免 panel 直接顯示不可讀原值。
  - 對 HAR detail 文字補上 HTML entity decode，避免 `&#40845;` 這類 numeric entity 直接出現在畫面上。
- Evidence:
  - `npm run timeline:prepare`
  - `source/round1/viewer/timeline.json`
  - `apps/timeline-viewer/public/generated/round1/timeline.json`
  - 實際檢查 HAR event 已存在：
    - `detail.request`
    - `detail.response`
    - `detail.headers`
- Decision: feasible

### FEEDBACK
- Positive: 先在 prepare 階段把 HAR 明細轉成字串摘要，連 HTML entity decode 也能一併集中處理，前端就不用直接理解完整 HAR schema，UI 實作明顯簡單很多。
- Negative: 明細目前是預先寫進 `timeline.json`，round 量再放大時，檔案體積與初始載入成本仍可能上升。
- Evidence: `prepare-rounds.mjs` helper、重建後的 `timeline.json` 明細欄位、`timeline:prepare` 成功。
- Next Run: 若後續 round 數量與 HAR 體積持續增加，可評估把明細改成按需載入，或只在 panel 開啟時讀原始 HAR。

## Task B - 補上 HAR detail toggle panel

- Goal: 點擊 HAR 卡片時，在該項目下方展開 detail panel，再點一次收起。
- Method:
  - 在 `useTimelineModel.js` 新增 `activeRequestDetail`，只維持一個目前展開中的 HAR item。
  - 修改 `handleLaneEventClick`，在一般 inspect 模式下，點同一筆 HAR 會 toggle，點不同筆則切換目標。
  - 在 `TimelineViewer.vue` 的 HAR lane 內新增 detail panel，顯示 `Request / Response / Header` 三區，並在展開時提高 HAR lane 高度。
  - 在 `base.css` 補上 active card 與 detail panel 樣式，避免展開後內容難讀。
- Evidence:
  - `npm run timeline:build`
  - `apps/timeline-viewer/src/composables/useTimelineModel.js`
  - `apps/timeline-viewer/src/components/TimelineViewer.vue`
  - `apps/timeline-viewer/src/styles/base.css`
  - build 成功，代表 template / state / CSS 已可正常承接新 panel 結構。
- Decision: feasible

### FEEDBACK
- Positive: 用單一 `activeRequestDetail` 就能完成「點一下展開、再點一下收起」，不需要把 detail state 持久化，也不會和 viewer-state 契約混在一起。
- Negative: 這輪主要證據是 build 與程式邏輯驗證；因 sandbox 內沒有直接做瀏覽器實點 smoke test，所以 panel 的最終視覺細節仍建議再人工看一次。
- Evidence: `useTimelineModel.js` 的 toggle 邏輯、`TimelineViewer.vue` 的 panel 結構、`timeline:build` 成功。
- Next Run: 若之後發現 panel 太高或遮擋相鄰項目，可再改成抽屜式 inspector 或只保留單一 section 預覽。

## Task C - 文件與 issue 同步

- Goal: 讓下一輪知道 viewer 已支援 HAR 明細展開與目前限制。
- Method:
  - 更新 root `README.md` 的目前能力描述，補上 HAR 明細 panel。
  - 更新 `apps/timeline-viewer/README.md`，說明 HAR panel 與目前 detail 仍為 prepare 階段預先整理的限制。
  - 新增 `issue/issue-9/plan.md` 與完成本檔。
- Evidence:
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-9/plan.md`
  - `issue/issue-9/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 這次有同步把功能說明與 issue 入口一起往前推，下一輪不會還以為目前只停在 issue-8 的狀態。
- Negative: README 目前仍是摘要型文件，若未來 HAR 明細規則越來越多，可能需要獨立一份 schema 或 viewer interaction 文件。
- Evidence: README 入口改到 issue-9、viewer README 新增 HAR detail panel 說明。
- Next Run: 若再擴充 panel 能力，可把 HAR detail 的欄位規則與截斷策略另外整理成小節，減少後續猜測。

## Task D - 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare，並留下證據與 FEEDBACK。
- Method:
  - 執行 `npm run timeline:build` 驗證前端編譯。
  - 執行 `npm run timeline:prepare` 驗證 HAR 明細資料可被重建進 round1 viewer 輸出。
  - 直接檢查 `timeline.json`，確認 HAR event 已含 detail 欄位。
- Evidence:
  - `npm run timeline:build`
  - build 成功
  - `npm run timeline:prepare`
  - round1 實跑結果：
    - `Prepared round1: 82 slices / 146 HAR / 357 recording`
  - `node` 檢查輸出顯示 `har-1` 已含 request / response / headers detail 內容。
- Decision: feasible

### FEEDBACK
- Positive: build 與 prepare 都過，代表這次不只 UI 能編譯，連 HAR detail 資料準備流程也真正打通。
- Negative: 目前尚未量測新增 detail 後 `timeline.json` 對載入速度的影響，這是之後若 round 變大需要優先回看的風險。
- Evidence: `timeline:build` 成功、`timeline:prepare` 成功、重建後的 `timeline.json` 實際內容。
- Next Run: 補一次實機點選驗證，確認同一筆 HAR 連點收合、切換另一筆展開、以及長內容捲動手感都符合預期。
