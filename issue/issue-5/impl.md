# Issue 5 - 優化 video-to-images 的卷動去重與 focus 預覽

## Status

完成。

本檔記錄 `video-to-images` 卷動畫面 overlap 規則與 `focus` 預覽放大調整的實作結果、證據與 FEEDBACK。

## Task A - 建立卷動畫面 overlap 略過規則

- Goal: 針對上下卷動造成的高重疊連續畫面，加入 `50% overlap` 略過規則，降低人工判讀負擔。
- Method:
  - 在 `tools/video-to-images/screenshot.py` 新增 `--scroll-overlap-threshold` 與 `--scroll-overlap-similarity` 參數。
  - 對每張候選圖與「上一張保留圖」做垂直卷動 overlap 比對，分別檢查：
    - 上一張底部 vs 下一張頂部
    - 上一張頂部 vs 下一張底部
  - 當 overlap 比例達 `0.5` 且相似度達 `0.92` 時，略過下一張。
  - 被略過的 scene 仍寫入 `skipped_captures`，並把時間範圍併回上一張保留圖，避免 timeline 出現時間缺口。
- Evidence:
  - `npm --prefix apps/timeline-viewer run prepare:round1`
  - round1 實跑結果：
    - `raw_scene_count = 397`
    - `capture_count = 82`
    - `skipped_overlap_count = 315`
  - 第一筆略過樣本：
    - scene `2`
    - overlap `1.0`
    - similarity `0.961`
    - direction `scroll-up`
- Decision: feasible

### FEEDBACK
- Positive: 直接用相鄰保留圖做垂直 overlap 判斷，就能明顯壓低上下卷動畫面的重複輸出，而且不需要先引入更重的 OCR 或頁面語意辨識。
- Negative: 規則屬於 heuristic，對 sticky header、局部內容更新或過場動畫較多的頁面，仍可能出現誤判；另外若只略過圖片卻不延展時間範圍，會傷到 HAR/Recording 對齊，這次已補修正。
- Evidence: `screenshot.py` 的 overlap 判斷與 `skipped_captures` 輸出、`prepare:round1` 的統計結果、修正前後 HAR 對齊數量觀察。
- Next Run: 可補抽樣檢查 `skipped_captures`，區分「安全略過」與「疑似誤略過」，再決定是否需要白名單頁型、sticky header 補償或人工覆核模式。

## Task B - 調整 focus 圖預覽大小

- Goal: 當圖片進入 `focus` 狀態時，預覽再放大兩級，提升人工比對效率。
- Method:
  - viewer 的縮圖 hover preview 從固定較小的 `n-image` 改為受 CSS 控制的放大預覽圖。
  - 預覽寬度調整為 `min(520px, calc(100vw - 72px))`，並加上 `max-height: 72vh` 與 `object-fit: contain`，讓放大後仍可在較小視窗內閱讀。
- Evidence:
  - `npm --prefix apps/timeline-viewer run build`
  - viewer build 成功，沒有因預覽元件替換而報錯。
- Decision: feasible

### FEEDBACK
- Positive: 直接把預覽圖做大，比只放大縮圖本體更符合人工檢查流程，也比較不會打亂 timeline 主畫面密度。
- Negative: 這次把「focus」解讀為圖片預覽狀態，因此實作在 hover preview；若後續你要的是 selected / active 狀態下的常駐放大圖，仍需再補一層明確交互。
- Evidence: `TimelineViewer.vue` 預覽結構調整、`base.css` 的 preview 尺寸規則、viewer build 成功。
- Next Run: 若使用者在整理時更常用 click 而不是 hover，可再補 `selected slice` 的固定大圖面板，避免滑鼠離開後預覽消失。

## Task C - 驗證對人工判讀流程的影響

- Goal: 確認 overlap 規則與 `focus` 預覽放大是否真的降低人工判讀成本。
- Method:
  - 用 round1 既有素材重跑一次完整 `prepare:round1`，比較去重後的代表圖數量與 timeline 對齊結果。
  - 檢查去重後 HAR / Recording 是否仍維持可用覆蓋，避免只是在 UI 上變少圖。
- Evidence:
  - 去重後代表圖由 `397` 個 scene 降為 `82` 張保留圖。
  - 修正時間範圍併回後，timeline 仍可對到：
    - `141` HAR events
    - `357` recording events
  - `source/round1/viewer/timeline.json` 與 `round-meta.json` 已保留：
    - `rawSceneCount`
    - `skippedOverlapCount`
    - `overlapRule`
- Decision: partial

### FEEDBACK
- Positive: 這次驗證顯示，若把略過 scene 的時間範圍併回上一張保留圖，重複圖可以大幅下降，同時維持 timeline 對齊可用性，符合 POC 「降低人工成本但不破壞證據鏈」的目標。
- Negative: 目前只驗 round1，還不能直接推論所有錄影類型都適合同一組門檻；此外 `82` 張是否已是最佳密度，仍需要人實際用 viewer 比對後才知道。
- Evidence: `prepare:round1` 的輸出統計、`manifest.json` 的 skipped 資訊、`timeline.json` / `round-meta.json` 的 overlap metadata。
- Next Run: 找 1 到 2 段不同捲動節奏的影片做交叉驗證，確認 `0.5 / 0.92` 是否穩定，必要時再拆成不同頁型的 preset。

## Task D - 文件同步

- Goal: 同步更新 issue 與相關文件，讓下一輪可直接承接。
- Method:
  - 更新 `tools/video-to-images/README.md`，補上 overlap 規則、manifest 新欄位與新參數。
  - 更新 `apps/timeline-viewer/README.md`，補上 focus preview 放大與 prepare 預設套用 overlap 去重。
  - 完成本 `impl.md`。
- Evidence:
  - `tools/video-to-images/README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-5/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 這次把規則、風險與實跑統計一起寫回文件，下一輪就不需要再從程式碼倒推這個 heuristic 是怎麼決定的。
- Negative: 文件目前仍偏 POC 規格與觀察紀錄，尚未整理成正式 schema 或可供外部工具直接引用的固定契約。
- Evidence: 更新後的 README 與本 issue 紀錄。
- Next Run: 若 overlap 規則後續會被更多工具共用，可再補一份 manifest schema 說明與欄位範例。
