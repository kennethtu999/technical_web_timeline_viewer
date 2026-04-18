# 系統翻新驗證工作台

## 快速使用

目前 viewer 與資料準備流程，`每個 round 只讀固定三個檔案`：

- `source/round{n}/video.mp4`
- `source/round{n}/network.har`
- `source/round{n}/recording.json`

正式 `HAR-driven` prepare 另外會選讀全域 baseline：

- `source/baseline/page_login.jpg`
- `source/baseline/page_login.json`

用途是把登入頁代表圖與登入流程設定自動轉成 timeline 的開始錨點。

`page_login.json` 目前可描述：

- `video_offset_ms`
- `show_login_page`
  - 登入頁顯示時對應的 HAR request 規則
- `submit_login_page`
  - 登入送出時對應的 HAR request 規則
  - 可附 `recording.click.string` 作為 Recording 提示字串
  - 可附 `recording.click.order` 指定第幾次點到登入才算主要送出

新截圖模式的前提是：

- 系統已安裝 `ffmpeg` 與 `ffprobe`
- `video_start` 能從 `recording.title`、`video.mp4` 檔名或 `recording.json` 檔名中正確推回
- `network.har` 內要有可用的 HTML 類 `GET / POST` 事件

快速操作方式如下：

1. 新增開始一個 round
   - `npm run timeline:round:add -- round2`
   - 接著把 `video.mp4`、`network.har`、`recording.json` 放進 `source/round2/`
   - 再執行 `npm run timeline:prepare`
2. 啟動 viewer
   - `npm run timeline:dev`
3. 移除整個 round 資料
   - `npm run timeline:round:remove -- round2`
4. 重新開始同一個 round
   - `npm run timeline:round:restart -- round2`
   - 這會保留三個原始檔，只清掉 `artifacts/`、`viewer/` 與 app 端的 generated 輸出
   - 清掉後重新執行 `npm run timeline:prepare`

如果 round 目錄裡還留著舊檔名或備份檔，viewer 目前也只會讀上面這三個固定入口，不再自動猜測檔名。
`npm run timeline:round:restart -- round1 && npm run timeline:prepare && npm run timeline:dev`

## 專案起源

本專案起源於舊系統轉置需求。

在舊系統轉到新系統的過程中，不能只靠人工印象或零散截圖判斷新系統是否正確，必須建立一套明確、可重複、可追溯的驗證方法。

目前手上的 `錄影 + HAR + Recording`，正好代表同一段操作流程的三種觀點：

- 錄影：看到使用者操作後的畫面結果
- HAR：看到系統實際發出的網路請求與回應
- Recording：看到使用者操作步驟、輸入行為與頁面切換脈絡

本專案的核心目的，就是把這三種素材整理成可用的驗證資料，提供新系統做測試、比對與驗證。

## 專案用途

這個專案用來整理一批舊系統操作過程所留下的三類證據資料，並驗證是否能把它們解構成可閱讀、可追溯、可比對的中繼資料，供後續系統翻新、流程比對與自動化測試使用。

目前關注的來源包含：

- HAR 網路封包
- Recording 操作錄製 JSON
- 螢幕錄影 MP4

本案現在已進入真實使用階段，但核心仍是把舊系統操作證據整理成可驗證、可追溯、可比對的工作底稿，不追求一次擴成過度工程化的大系統。

更具體地說，本專案希望把舊系統操作證據轉成新系統可直接使用的驗證基底，例如：

- 測試案例草稿
- 驗證流程清單
- 畫面與流程比對依據
- 自動化測試可引用的種子資料

## 目前階段

目前是「正式使用中的驗證工具」階段。

核心問題已不再是單純驗證能不能做，而是要讓下面幾件事能穩定支撐實際工作：

1. HAR 和 Recording 的對齊結果能否持續支撐交易或流程層級分析。
2. HAR 驅動切圖與 timeline viewer 是否足以支撐人工檢查與追溯。
3. 哪些資訊已可自動抽取，哪些仍需人工補強，界線是否清楚。
4. round 操作流程與文件是否足夠穩定，讓下一輪可直接接手。

因此現階段的輸出，應優先是：

- 可直接使用的 round 操作流程
- 可追溯的 viewer 與中繼資料
- 風險與限制
- 下一輪該怎麼做更有效

而不是為了產品化想像，過早投入完整平台化或過度模組化。

## 目前狀態

目前已建立一個可操作的 `round-based timeline viewer`，用來把同一輪素材的：

- 縮圖
- Recording
- HAR

放進同一個可水平比對的工作台。

現階段 viewer 已具備：

- 可選擇 `source/round{n}` 指定目錄
- `video.mp4 / network.har / recording.json` 固定入口命名
- 以 HAR 關鍵事件驅動縮圖：
  - `GET` 取 `response + 0.5 秒`
  - `POST` 取 `request - 0.5 秒` 與 `response + 0.5 秒`
  - 目前只取 `Content-Type` prefix 為 `text/htm` 的 `GET / POST`
- 可選讀 `source/baseline/page_login.jpg` 與 `page_login.json` 作為登入開始錨點
- `Offset` 置頂的 timeline 工作區
- `Groups` 水道可直接用 `+ / -` 決定：
  - `+` 建立新群組
  - `-` 加入前一個群組
- `Recording` 與 `HAR` 水道支援收合：
  - 同時間點超過兩筆時，預設只顯示前兩筆
  - 可點 `更多` 展開
  - 可再點 `收起`
- HAR 卡片可點擊展開 detail panel：
  - 以 Tabs 顯示 `Response Text / Response / Request / Header`
  - 預設打開 `Response Text`
  - `Response Text` 會盡量去除 HTML tag，改顯示可讀純文字
  - 再點同一筆可收起
- 右側 `Control Panel` 可設定：
  - 起始點
  - 結束點
  - 隱藏圖片
  - Group multiple select filter
  - HAR kinds filter
  - HAR URL regex filter
  - zoom
- `Timeline panel` 可上下左右捲動，`Control Panel` 保持獨立捲動
- 本地開發模式下可把 viewer 設定寫回 `viewer-state.json`
  - 目前會保存：起始點、結束點、隱藏圖片、offset、group filter、HAR kinds、HAR URL regex、zoom
  - `RESET` 可讓目前 round 回到預設控制台狀態

這代表目前已能用同一個 round 目錄承接：

- 原始素材
- 衍生縮圖
- timeline data
- 人工校正狀態

作為下一輪整理與驗證的基底。

## Issue 結構

本專案從現在起以 issue 為最小工作單位。

規則如下：

- 每個 issue 使用 `issue/issue-{no}/` 目錄。
- 該 issue 的計畫放在 `issue/issue-{no}/plan.md`。
- 該 issue 的執行紀錄、實驗結果與 FEEDBACK 放在 `issue/issue-{no}/impl.md`。
- 下一個 issue 依序使用下一個編號，例如 `issue/issue-2/`、`issue/issue-3/`。
- 若未特別指定，AI 應優先讀取最新 issue 編號的 `plan.md` 與 `impl.md`。

## 目前資料來源

目前 viewer 只讀 `source/round{n}/` 下的固定入口：

- `network.har`
- `recording.json`
- `video.mp4`

以 `source/round1/` 為例，round 的原始素材、備份檔名或其它參考檔可以保留，但實際進 viewer / prepare 流程時，只有上面三個檔名會被讀取。

另外正式 prepare 會選讀全域 `source/baseline/` 作為登入頁錨點來源，不屬於每個 round 個別必備檔案。

viewer 相關輸出目前位於：

- `source/round1/viewer/timeline.json`
- `source/round1/viewer/viewer-state.json`
- `source/round1/viewer/round-meta.json`
- `source/round1/viewer/thumbnails/*`
- `source/round1/artifacts/har-captures/sampling/*`

其中 `sampling/` 目前會固定輸出前 10 秒、每秒一張的保底取樣圖，方便人工快速回看登入前置畫面與時間對齊。

這三份資料共同構成：

- 使用者做了什麼
- 系統送出了什麼
- 畫面當時看到了什麼

的三軸證據基礎。

## 現階段成功標準

本階段若要算成功，至少要能維持：

- 至少一條可重複執行的正式流程
- 至少一份明確標示限制與人工補強點的紀錄
- 一份讓下一輪可以直接承接的 FEEDBACK

現階段不要求把所有問題一次解完，但要求每一次修改都能支撐真實驗證作業，且讓下一次執行更快、更準。

## 協作原則

- 原始素材視為唯讀，不覆寫來源檔。
- 所有實驗、推論與限制都要明確記錄。
- 若結論帶有推估成分，要標示信心度或限制條件。
- 所有計畫任務都必須補上正向與負向 FEEDBACK，幫助下一輪執行優化。

## 下一步

目前請以 [issue/issue-12/plan.md](./issue/issue-12/plan.md) 作為目前要執行的主計畫，以 [issue/issue-12/impl.md](./issue/issue-12/impl.md) 作為本輪執行紀錄，並以 [AGENTS.md](./AGENTS.md) 作為 AI 協作入口。
