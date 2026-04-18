# Issue 6 - 固定 round 三檔契約與 viewer 篩選操作整理

本 issue 承接目前已可操作的 round-based viewer，聚焦把 round 輸入契約與人工檢查操作收斂成更穩定的使用方式，避免每次都依賴猜檔名或在 timeline 上做過多人工捲動切換。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 viewer 已能把 `VIDEO / HAR / Recording` 對齊，但在實際使用上仍有幾個會直接增加試錯成本的點：

- round 來源檔仍帶有自動偵測與別名概念，對新 round 建立流程不夠明確。
- timeline 與 control panel 的卷動責任不夠清楚，人工比對時容易來回移動。
- 已有 groups，但缺少直接用 group 收斂畫面的過濾入口。
- HAR 過濾只有 kind checkbox，無法再對 URL pattern 做二次聚焦。
- round 新增 / 移除 / 重建的使用方式尚未被整理到 README 最前面。

這些問題都會直接影響「下一輪能不能更快開始、人工能不能更快聚焦」這個 POC 目標，因此值得先收斂規則與使用入口。

## 2. 目標

本 issue 要回答：

1. round 輸入是否可以收斂成固定只讀 `video.mp4 / network.har / recording.json` 三檔。
2. timeline / control panel 的卷動分工是否能更清楚，降低人工操作混亂。
3. group 與 HAR URL pattern 過濾是否能有效幫助人工聚焦。
4. README 是否已足夠說明 round 的新增、移除與重新開始流程。

## 3. 執行項目

### Task A. 收斂 round 輸入契約

- Goal: 讓每個 `source/round{n}` 只吃固定三個檔案，不再依賴檔名猜測。
- 預期輸出：
  - `prepare` 改為直接驗證 `video.mp4 / network.har / recording.json`
  - 缺檔時能回報明確錯誤
  - README 補上固定契約說明

### Task B. 調整 viewer 操作面板與過濾

- Goal: 讓 timeline 與 control panel 的卷動責任更清楚，並補齊 group / HAR URL regex 過濾能力。
- 預期輸出：
  - timeline panel 支援清楚的上下左右卷動
  - control panel 保持獨立捲動
  - Source Directory 下新增 group multiple select，預設「全部」
  - HAR kinds 區新增 URL regex input

### Task C. 整理 round 管理流程

- Goal: 讓下一輪能直接用明確步驟建立、移除、重建 round。
- 預期輸出：
  - round add / remove / restart 操作方式
  - 視需要補 helper script
  - README 最上方補上操作手冊

### Task D. 驗證與文件同步

- Goal: 確認修改後 round1 仍可正常 prepare / build，並留下證據與 FEEDBACK。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - `issue/issue-6/impl.md`
  - 視需要更新 `apps/timeline-viewer/README.md`

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

1. `prepare` 已只讀固定三檔，且缺檔訊息明確。
2. viewer 已有 group multiple select 與 HAR URL regex filter。
3. timeline / control panel 卷動責任更清楚。
4. README 最上方已可直接說明新增、移除、重建 round 的方式。
5. `impl.md` 已完整補上 FEEDBACK。

## 6. 風險

- 固定三檔契約會降低彈性，若來源命名不一致，需先人工整理檔名。
- group filter 只對已有群組有效，若群組本身定義不佳，仍無法取代人工判斷。
- URL regex 若寫錯，可能造成 HAR 看起來像「沒有資料」，因此需要保留錯誤提示。
- round restart / remove 屬於清理操作，文件需清楚說明會刪除哪些產出。

## 7. 驗收重點

本 issue 驗收重點是：

- round 契約是否足夠明確，下一輪不用再猜檔名
- group / regex filter 是否真的能幫助人工聚焦
- README 是否可直接作為 round 操作入口
- 證據與限制是否已寫清楚，方便下一輪承接
