# Issue 1 - POC 執行紀錄

## 執行摘要

本次依 `issue-1/plan.md` 針對 `Recording + HAR + MP4` 做第一輪 POC 驗證，目標是確認這三類素材是否足以整理成新系統可用的驗證資料。

本輪總結如下：

- Route A `Recording 結構可用性`：`feasible`
- Route B `HAR 重點事件抽取`：`feasible`
- Route C `Recording 與 HAR 對齊`：`partial`
- Route D `MP4 截圖與檢核價值`：`partial`
- Route E `最小檢視輸出`：`feasible`

整體判斷：

- 這批資料足以建立「流程骨架 + 關鍵後端事件 + 人工截圖佐證」的驗證基底。
- 目前最適合的方向不是直接做完整產品，而是先做一批高信心情境的驗證種子資料。
- 完全逐步自動對齊的信心不足，因此下一輪應採「高信心節點自動化 + 低信心節點人工校正」策略。

## Session 錨點

- Recording 檔名時間：`2026-04-17 11:21:38`（Asia/Taipei）
- 錄影檔名時間：`2026-04-17 11:21:22`（Asia/Taipei）
- HAR 第一筆時間：`2026-04-17 11:21:49.141`（Asia/Taipei）

初步對照結果：

- 錄影比 Recording 早 `16.0` 秒
- HAR 比 Recording 晚 `11.141` 秒
- HAR 比錄影晚 `27.141` 秒

這代表三份素材至少在 session 起點上具備可用的時間錨點，可支撐交易層級對齊。

## Route A. Recording 結構可用性驗證

- Goal: 確認 Recording 是否足以建立流程骨架。
- Method: 解析 Recording JSON，盤點 step 數量、type 分布、欄位結構、selector 語意與具代表性的 step 樣本。
- Evidence:
  - 全檔共 `357` 個 steps。
  - type 分布為 `click 260`、`change 63`、`navigate 12`、`doubleClick 9`、`keyDown 6`、`keyUp 6`、`setViewport 1`。
  - 常見欄位包含 `type`、`target`、`selectors`、`frame`、`offsetX/Y`、`assertedEvents`、`value`。
  - `selectors` 多數長度落在 `4` 或 `5`，表示同一節點通常有多重定位線索。
  - 可直接讀到的語意欄位包含 `使用者代碼`、`使用者密碼`、`登入`、`存款查詢`、`付款戶名`、`付款銀行`、`收款銀行`、`待核定`、`匯利率查詢` 等。
  - 可見多段具業務意義的流程，例如登入、帳戶查詢、轉帳付款、待核定、繳費/繳稅。
- Decision: feasible

### FEEDBACK

- Positive: `selectors` 中的 `aria/` 與 `text/` 文字非常有價值，足以支撐流程語意抽取；`change` steps 也保留了重要輸入資訊，可用來重建測試情境。
- Negative: 幾乎沒有逐步絕對時間戳；`assertedEvents` 僅少量附帶 URL，多數 navigation 仍是泛用型訊號；部分 `value` 含敏感或複合資料，不能直接當成最終驗證輸出。
- Evidence: `357` 個 steps、`13` 個 asserted URL、`88` 個 transition markers，以及大量 `aria/付款戶名`、`aria/付款銀行`、`aria/待核定` 等 selector 文本。
- Next Run: 先做 `selector label normalization`、`流程節點分段`、`敏感值遮罩` 三件事，把 Recording 從低層事件流升級成可引用的驗證步驟。

## Route B. HAR 重點事件抽取驗證

- Goal: 確認 HAR 是否能抽出對流程與畫面有意義的關鍵事件。
- Method: 解析 HAR entries，盤點狀態碼、方法、MIME type、`.faces` 路徑與 POST / redirect / error 類事件。
- Evidence:
  - HAR 共 `4683` entries，但只有 `45` 筆 POST。
  - 狀態碼以 `200` 為主，共 `4630` 筆；另有 `302` 共 `21` 筆。
  - MIME type 高度集中在 `image/gif 3125`、`application/javascript 917`、`image/jpeg 253`、`text/css 207`，證明靜態資源佔絕大多數。
  - 聚焦 POST 後，可看到明確流程鏈，例如 `login.faces`、`GFA010Home.faces`、`GAC010/020/030/060/070`、`GPA011/012/014/027/033/170/180` 等。
  - `commonError.faces`、`commonErrorNoMenu.faces`、`TxPageHandler` 顯示此 session 內含錯誤轉導與流程切換。
- Decision: feasible

### FEEDBACK

- Positive: 以 `POST + 302 + .faces 路徑` 過濾後，HAR 可以快速收斂成業務有意義的事件鏈；大量靜態資源雖多，但非常容易與主流程分離。
- Negative: 若直接看全量 HAR，訊號會被圖檔與 JS/CSS 淹沒；`TxPageHandler` 與某些 generic faces 路徑語意仍不足，不能單靠 URL 還原完整畫面意圖。
- Evidence: `4683` entries 中僅 `45` 筆 POST，另有 `51` 筆值得關注的 POST / redirect / error 類事件；`.faces` 路徑高頻集中在少數業務模組。
- Next Run: 建立 `HAR 事件白名單`，優先保留 `POST`、`302`、`commonError*`、`TxPageHandler` 與業務 `*.faces`，其餘靜態資源僅作背景參考。

## Route C. Recording 與 HAR 對齊驗證

- Goal: 確認前端操作與後端事件能否形成可追溯鏈。
- Method: 用檔名時間建立 session 錨點，再以 Recording 中的功能語意與 HAR 的 POST 路徑序列做主流程比對。
- Evidence:
  - session 起點具備可用錨點：錄影、Recording、HAR 的起始時間差固定在數十秒內。
  - Recording 前段可看出登入與帳戶查詢，對應 HAR 前段的 `login.faces`、`GFA010Home.faces`、`GAC010/020/030/060/070.faces`。
  - Recording 中段出現 `轉帳付款`、`付款戶名`、`付款銀行`、`收款銀行`、`收款人資料查詢`、`國內銀行代碼查詢`，對應 HAR 中的 `commonBankCode.faces`、`GPA011Home.faces`、`GPA011Confirm.faces`、`GPA012Home.faces`。
  - Recording 後段可見 `待核定`、`繳費/繳稅`、`匯利率查詢` 等功能切換，HAR 後段則出現 `GPA170Home.faces`、`GPA1716Input.faces`、`GPA180Home.faces`。
  - 但 Recording 僅少量 step 帶 URL，而且多數 navigation 回到泛用的 `ebcontent.jsp`，不足以支撐逐步精準對位。
- Decision: partial

### FEEDBACK

- Positive: `檔名時間 + 功能選單文字 + 表單欄位名稱 + HAR POST 路徑序列` 的組合，足以做到交易層級或主要步驟層級對齊。
- Negative: Recording 缺少逐步時間，`assertedEvents` 太少且常落在 generic URL；若強行追求 step-to-request 毫秒級對應，誤判風險很高。
- Evidence: `HAR 比 Recording 晚 11.141 秒`、`錄影比 Recording 早 16 秒`，以及 `轉帳付款` 對應 `GPA011*`、`待核定/繳費繳稅` 對應 `GPA170/GPA180` 的模組級映射。
- Next Run: 下一輪應以 `scenario / step-range / matched HAR events / confidence` 的形式產出對照表，並將對齊分成 `high`、`medium`、`manual-review` 三層。

## Route D. MP4 截圖與檢核價值驗證

- Goal: 確認影片是否值得納入正式流程，還是只適合人工補強。
- Method: 使用 `ffprobe` 讀取影片資訊，並以 `ffmpeg` 依時間點擷取樣本畫面進行人工檢視。
- Evidence:
  - 影片長度約 `719.866933` 秒，編碼 `h264`，解析度 `1920x1080`。
  - 已成功擷取 `issue/issue-1/artifacts/frame-20s.jpg` 與 `issue/issue-1/artifacts/frame-340s.jpg`。
  - `frame-340s.jpg` 能清楚看到功能選單、頁籤、欄位與日期，適合做人工畫面比對。
  - `frame-20s.jpg` 則顯示 DevTools / Browser UI，代表固定時間切圖不一定直接落在有價值的業務畫面。
- Decision: partial

### FEEDBACK

- Positive: 影片清晰度足夠，且關鍵時間點切圖可當作畫面驗證佐證；對人工比對與補足 Recording/HAR 無法表達的畫面內容很有幫助。
- Negative: 固定頻率切圖容易產生低價值畫面，例如瀏覽器 UI、載入中狀態或非業務主體畫面；影片不適合作為完全自動化主資料源。
- Evidence: `ffprobe` 成功讀到完整媒體資訊，兩張樣本截圖均成功輸出，其中一張具高價值表單畫面，一張則是低價值工具視窗畫面。
- Next Run: 先用 HAR / Recording 估出高價值時間點，再做定點截圖；不要先做全片固定頻率切圖作為主策略。

## Route E. 最小檢視輸出驗證

- Goal: 確認是否能先產出最小可讀成果，而不急著做完整產品。
- Method: 根據本輪證據回推最小可用輸出，評估哪些欄位足以支撐新系統測試與驗證。
- Evidence:
  - Recording 足以提供 `流程步驟 + 欄位語意 + 操作值`。
  - HAR 足以提供 `功能模組 + POST 鏈 + 錯誤轉導`。
  - MP4 足以提供 `人工檢核 screenshot`。
  - 這三者組合後，已可支撐情境化驗證資料，不必先做完整 Web UI。
- Decision: feasible

### FEEDBACK

- Positive: 以 Markdown/JSON 形式先產出 `scenario seeds`、`matched HAR paths`、`screenshot refs`，就足以支持測試設計與翻新比對討論。
- Negative: 若現在就投入完整 UI，反而會把時間花在呈現層，而不是把高信心驗證材料先做穩。
- Evidence: 本輪已能從純分析中整理出登入、帳戶查詢、轉帳付款、待核定/繳費繳稅等候選情境，不需要 UI 才能理解資料價值。
- Next Run: 先做 `validation-material-seeds` 與 `correlation-map` 兩類輸出，等高信心情境累積到一定程度，再決定是否做 viewer。

## 建議的驗證種子資料

以下是本輪可直接延伸成新系統測試 / 驗證材料的候選情境：

1. `login-and-retry`
   - 內容：使用者登入、嘗試錯誤輸入、再次登入。
   - 證據：Recording 前段出現使用者代碼/密碼/登入；HAR 前段有 `login.faces -> GFA010Home.faces`。
   - 用途：驗證登入成功、失敗與重新進入首頁。

2. `account-inquiry-sequence`
   - 內容：帳戶查詢、存款查詢、餘額查詢、明細查詢、定存查詢。
   - 證據：Recording 前段大量 `帳戶查詢 / 存款查詢 / 查詢`；HAR 有 `GAC010/020/030/060/070`。
   - 用途：驗證查詢流程、錯誤頁轉導與查詢條件切換。

3. `payment-edit-and-bank-code-lookup`
   - 內容：轉帳付款、輸入付款戶名/付款銀行/金額、開啟銀行代碼查詢。
   - 證據：Recording 中段有 `轉帳付款 / 付款戶名 / 收款銀行 / 國內銀行代碼查詢`；HAR 有 `commonBankCode.faces` 與 `GPA011*`。
   - 用途：驗證表單欄位、銀行代碼查詢彈層與確認流程。

4. `template-and-batch-payment-branches`
   - 內容：常用帳戶群組、薪資轉帳、台幣轉帳樣本維護、外幣轉帳樣本維護。
   - 證據：Recording 中後段可見多個轉帳付款分支；HAR 對應 `GPA027`、`GPA014`、`GPA033*`。
   - 用途：驗證多分支流程切換是否正確。

5. `pending-approval-and-payment-tax`
   - 內容：待核定、收付款、繳費/繳稅、匯利率查詢。
   - 證據：Recording 後段有 `待核定`、`繳款銀行`、`匯利率查詢`；HAR 有 `GPA170`、`GPA1716Input`、`GPA180`。
   - 用途：驗證待核定清單、繳費/繳稅與附屬查詢頁。

## 本輪結論

本次 POC 已證明：

- `Recording` 可以做流程骨架。
- `HAR` 可以做後端事件骨架。
- `MP4` 可以做人工畫面佐證。
- 三者組合後，可以整理出供新系統測試與驗證使用的初始資料基底。

但本次也證明：

- 逐步精準全自動對齊目前不夠穩。
- 影片不應作為主資料源，只適合作為關鍵節點補強。
- 現階段最有價值的產出是高信心情境種子，而不是完整 viewer。

下一輪建議直接建立：

- `validation-material-seeds.md`
- `correlation-map.json`
- `recording-flow-normalized.json`
- `har-key-events.json`

優先把 `高信心情境` 轉成新系統可執行的測試與驗證材料。
