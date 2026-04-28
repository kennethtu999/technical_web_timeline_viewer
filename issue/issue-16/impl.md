# Issue 16 - 依交易代號自動 Group JSF 頁面

## Status

完成。

## Task A - 盤點現有 JSF 頁面與手動 group 缺口

- Goal: 釐清目前哪些 slice 屬於 JSF 頁面、哪些交易頁仍沒有自動 group、現有樣本中有哪些交易代號 pattern 可直接觀察。
- Method:
  - 盤點 `apps/timeline-server/src/lib/prepare.js`、`apps/timeline-server/src/lib/prepare/har.js`、`source/megageb_round1/network.har`、`source/megageb_round2/network.har`。
  - 確認舊流程只有 `buildInitialGroups()` 建 `group-login-anchor`，交易頁沒有自動 group。
  - 直接掃 `TxPageHandler`、`taskID`、`appID` 與 `.faces` URL，確認現有樣本已存在 `GAC020`、`GAC010`、`GPA010` 等代號，且 `TxPageHandler` 都帶有 `taskID` 或 `appID`。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `source/megageb_round1/network.har`
  - `source/megageb_round2/network.har`
  - `source/megageb_round1/viewer/timeline.json` 實作前只有 `group-login-anchor`
- Decision: feasible

### FEEDBACK

- Positive: 先把真實 HAR 中的 `TxPageHandler` 與代號 pattern 掃出來後，能直接把規則收斂到 URL 交易代號與 FORM 殼層排除，不用先做大規模 viewer 改寫。
- Negative: 若只看現有 group 結果，會以為 viewer 不支援這條路；實際根因是在 prepare 階段根本沒產生交易 group。
- Evidence: `buildInitialGroups()` 原本只建立 login group；HAR 樣本中可看到 `taskID=GAC020`、`appID=GAC`、`GAC020Home.faces`。
- Next Run: 之後若要再擴規則，先從 HAR 抽取結果統計重複碼與未判定頁比例，再決定是否值得補更多 heuristic。

## Task B - 定義交易代號抽取與 FORM 排除規則

- Goal: 建立可追溯的規則，說明如何從 URL / FORM 判定交易代號與頁面主體。
- Method:
  - 在 `apps/timeline-server/src/lib/prepare/har.js` 為每個 HAR event 增加 `pageGroupHint`。
  - URL 判定優先支援：
    - `taskID`
    - `appID`
    - `.faces` 路徑前綴代號，例如 `GAC020Home.faces`、`3W3D...`
  - FORM 分析只負責抽 `formIds`、排除 `head` / `main` 共用 FORM，並標記可否承接目前交易 group。
- Evidence:
  - `apps/timeline-server/src/lib/prepare/har.js`
  - 新增 `pageGroupHint.transactionKey / transactionSource / formIds / nonSharedFormIds / canInheritCurrentGroup`
- Decision: feasible

### FEEDBACK

- Positive: 把交易代號抽取放進 HAR event 層後，後續 group 與 debug 都有同一份依據，不需要讓 `prepare.js` 重複 parse HTML 與 URL。
- Negative: pathname 代號抽取一開始把 `GAC020Home.faces` 誤吃成 `GAC020H`，後來才收斂成「先抓 `AAA999...` 類型，再抓 4 碼短代號」。
- Evidence: `extractTransactionKeyFromUrl()`、`extractPathTransactionCode()`、`buildPageGroupHint()`。
- Next Run: 若後續遇到更多非 `AAA999` 代號格式，先補樣本再擴 regex，不要直接把 pathname pattern 放寬。

## Task C - 實作 prepare / timeline 的 auto group

- Goal: 在不破壞既有 timeline 結構前提下，讓 prepare 輸出交易代號 group。
- Method:
  - 在 `apps/timeline-server/src/lib/prepare.js` 新增 `buildAutoTransactionGroups()`。
  - 規則如下：
    - `TxPageHandler` 且有 `taskID` 或 `appID` 時，一律開新 group
    - 同碼再次遇到新的 `TxPageHandler`，建立新的 group instance
    - 非 `TxPageHandler` 但 URL 可判交易代號時，歸入目前同碼 group，若前面沒有同碼 group 才新建
    - 非 `TxPageHandler` 且 URL 無碼，但 FORM 有非共用 FORM 時，可承接目前交易 group
    - 只有共用 FORM 的無碼頁面不自動歸類，保留人工判斷
  - `buildInitialGroups()` 改成同時保留 `group-login-anchor` 與 auto transaction groups。
- Evidence:
  - `apps/timeline-server/src/lib/prepare.js`
  - `apps/timeline-server/test/prepare.har-processing.test.js`
- Decision: feasible

### FEEDBACK

- Positive: 只改 prepare 層就能讓 viewer 直接吃到新 groups，既有 `Groups` 水道、group filter、群組操作都不必重寫。
- Negative: 同碼多次 `TxPageHandler` 會切出很多單 slice group，這是符合規則，但是否還要再疊一層人工整理策略，要看真實使用感受。
- Evidence: `buildAutoTransactionGroups()`、`group-tx-*` group id、單元測試中 `GAC020 #1 / #2` 的切段結果。
- Next Run: 若之後要讓整理者更快看懂重複操作，可考慮在 viewer 補上 group 來源類型或 sequence badge。

## Task D - 驗證樣本與記錄限制

- Goal: 以現有 round 樣本驗證 auto group，並記錄限制與 FEEDBACK。
- Method:
  - 執行 `npm --prefix apps/timeline-server test`
  - 執行 `npm --prefix apps/timeline-server run prepare:rounds -- megageb_round1`
  - 檢查 `source/megageb_round1/viewer/timeline.json` 的群組數與前段 group 結果
  - 同步更新 `README.md` 與 `apps/timeline-viewer/README.md`
- Evidence:
  - `apps/timeline-server` 測試 5/5 通過
  - `prepare:rounds` 成功重建 `megageb_round1`
  - `source/megageb_round1/viewer/timeline.json` 驗證後共有 `54` 個 group、`92` 個 slice 已有 group
  - 前段 group 已可看到：
    - `GFA010 #1`
    - `GAC`
    - `GAC010`
    - `GAC020 #1` 到 `GAC020 #6`
  - `README.md`
  - `apps/timeline-viewer/README.md`
- Decision: feasible

### FEEDBACK

- Positive: 單元測試與真實 round 都驗過後，可以確認這不是只在假資料成立；真實 HAR 已能長出穩定的交易 group。
- Negative: 非 `TxPageHandler` 且 URL 無碼、FORM 又只有共用殼層的頁面，仍然只能保留人工判斷，這個限制沒有被自動化吃掉。
- Evidence: `npm --prefix apps/timeline-server test`；`npm --prefix apps/timeline-server run prepare:rounds -- megageb_round1`；`source/megageb_round1/viewer/timeline.json`。
- Next Run: 若要再壓低人工量，優先統計未分組 JSF 頁面清單，再看是否值得從 hidden input 或後續 request 補更多判斷。
