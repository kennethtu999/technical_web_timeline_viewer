# Issue 16 - 依交易代號自動 Group JSF 頁面

本 issue 目標是提供 `自動 Group`，讓 timeline 能先依交易代號把 JSF 頁面自動分群，降低目前完全手動建 group 的整理成本。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 timeline 的 group 初始化仍只有登入錨點：

- `apps/timeline-server/src/lib/prepare.js` 的 `buildInitialGroups()` 只會建立 `group-login-anchor`
- `source/megageb_round1/viewer/timeline.json` 現況也只有 `group-login-anchor`

這代表交易頁的 group 仍完全仰賴人工整理，無法先替驗證者把同交易流程的頁面收斂在一起。

現有樣本也已提供可用線索：

- `source/megageb_round1/network.har` 與 `source/megageb_round2/network.har` 內可辨識出多組交易代號，例如：
  - `taskID=GAC010`
  - `taskID=GAC020`
  - `GAC010Home.faces`
  - `GFA010Home.faces`
- 同批樣本中，JSF HTML 頁面常同時存在多個 FORM，且共用 FORM 很高頻：
  - `head`：83 次
  - `main`：83 次
  - `form1`：8 次

因此本輪不是只看單一訊號，而是要把「URL 交易代號」、「TxPageHandler 開新群組」、「Response Content FORM 校驗頁面主體」三者整合成可執行規則。

## 2. 本次明確方案

### 2.1 分群範圍

- 本輪只處理 `JSF` 頁面相關 slice。
- 非 JSF 頁面、純靜態資源、JS / CSS / 圖片與明顯非交易頁，不納入交易代號自動 group。

### 2.2 交易代號判定優先順序

- `TxPageHandler` 就是本案要處理的 `dispatch` URL。
- 若 URL 已直接帶出交易代號，交易代號可由 URL 決定，例如：
  - `taskID=GAC020`
  - `GAC020Home.faces`
  - 其它符合既有資料可歸納 pattern 的代號，例如 `3W3D` 這類格式
- 若 `TxPageHandler` 只有 `appID`、沒有 `taskID`，則 `appID` 視為功能大類，仍視為一筆可分組的交易功能。
- `Response Content FORM` 仍是判定 JSF 頁面主體最準的依據，主要用途是：
  - 確認這是不是交易頁主 FORM
  - 排除共用 FORM
  - 在 URL 不夠明確時補強判斷
- 若 FORM 無法判定，才回退用 URL 判斷。

### 2.3 多 FORM 與共用 FORM 排除

- 若頁面存在多個 FORM，需先排除共用 FORM，再挑出最可能代表交易頁主體的 FORM。
- 現有樣本已知高頻共用 FORM 候選至少包含：
  - `head`
  - `main`
- 若後續在樣本中出現其它高頻共用 FORM，也要納入可維護的排除規則，不可把共用殼層誤判成交易頁識別依據。

### 2.4 自動 Group 行為

- prepare 階段先產出交易代號推論結果與 group 切段依據。
- `TxPageHandler` 開始的一定是新的 group。
- 同一交易代號可以有多個 group。
- 若同一交易代號在同 round 內跨多段流程重複出現，視為使用者操作多次，必須拆成不同 group，不可直接合併。
- timeline 初始化時，依「交易代號 + group 實例」自動建立 group。
- 若某頁無法高信心判定交易代號，保留未分組或回退人工處理，不可硬分。
- 若非 `TxPageHandler` 的 JSF 頁面無法從 URL 判出代號，且 `Response Content FORM` 也只有共用殼層，則明確落人工判斷。

## 3. 執行項目

### Task A. 盤點現有 JSF 頁面與手動 group 缺口

- Goal: 釐清目前哪些 slice 屬於 JSF 頁面、哪些交易頁仍沒有自動 group、現有樣本中有哪些交易代號 pattern 可直接觀察。

### Task B. 定義交易代號抽取與 FORM 排除規則

- Goal: 建立可追溯的規則，說明：
  - 如何判定 JSF 頁面
  - 如何從 URL 擷取交易代號，包含 `GAC020`、`3W3D` 類型 pattern
  - `TxPageHandler` 如何視為新的 group 起點
  - 如何從 `Response Content FORM` 校驗頁面主體與補強判斷
  - 如何排除 `head`、`main` 等共用 FORM
  - FORM 無法判定時，URL 在何種條件下可直接作為最終交易代號來源

### Task C. 實作 prepare / timeline 的 auto group

- Goal: 在不破壞既有 timeline 結構前提下，讓 prepare 能輸出「交易代號 + 分段後 group 實例」結果，並在 viewer 初始 group 中呈現。

### Task D. 驗證樣本與記錄限制

- Goal: 以現有 round 樣本驗證：
  - 自動 group 是否真的能把相同交易代號頁面收在一起
  - 同一交易代號重複操作時，是否已正確拆成多個 group
  - 共用 FORM 是否已被正確排除
  - 無法判定的頁面比例與原因是什麼
  - `TxPageHandler` 是否已被正確當作新 group 起點

## 4. 任務定位

本輪任務屬於：

- 正式流程維運與修正
- 風險釐清
- 證據整理

## 5. 成功標準

本 issue 若要算成功，至少需滿足：

1. JSF 頁面已有明確的交易代號抽取規則，可支援 `GAC020`、`3W3D` 這類 URL 代號 pattern。
2. 多 FORM 頁面可排除共用 FORM，不會直接拿 `head`、`main` 當交易頁主體依據。
3. `Response Content FORM` 會被用來校驗 JSF 頁面主體；FORM 無法判定時，可回退由 URL 決定交易代號。
4. `TxPageHandler` 會被視為新 group 起點；只有 `appID` 時也視為一筆可分組交易功能。
5. timeline 初始 group 不再只有 `group-login-anchor`，至少能對已辨識交易代號或 `appID` 功能頁的頁面自動分群。
6. 同一交易代號可在同 round 內生成多個 group，且重複操作不會被錯誤合併。
7. 對非 `TxPageHandler` 且無法判定交易代號的頁面，有明確人工判斷 fallback。
8. `issue/issue-16/impl.md` 有完整結果、限制與 FEEDBACK。

## 6. 風險

- 非 `TxPageHandler` 的 JSF 頁面若 URL 沒有可辨識交易代號，且 `Response Content FORM` 也只有共用殼層，仍無法自動歸類，這類頁面需保留人工判斷成本。

## 7. 驗收重點

本 issue 驗收重點是：

- 自動 group 是否能有效降低人工整理交易頁的成本
- 規則是否以證據為基礎，而不是只靠 URL 猜測
- 哪些 JSF 頁面已可穩定自動分群，哪些仍需人工補強
