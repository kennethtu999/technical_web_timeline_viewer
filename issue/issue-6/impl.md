# Issue 6 - 固定 round 三檔契約與 viewer 篩選操作整理

## Status

完成。

本檔記錄 round 固定三檔契約、viewer 的 group / HAR regex 過濾、timeline / control panel 卷動整理，以及 round 管理流程文件化的實作結果、證據與 FEEDBACK。

## Task A - 收斂 round 輸入契約

- Goal: 讓每個 `source/round{n}` 只吃固定的 `video.mp4 / network.har / recording.json`，不再依賴檔名猜測。
- Method:
  - 將 `apps/timeline-viewer/scripts/prepare-rounds.mjs` 的 round 輸入偵測改為固定驗證三個 canonical 檔名。
  - 移除 prepare 過程中的別名建立行為，避免 round 目錄裡同時存在多種入口時又回到猜測路線。
  - `video-start` 改優先從 `recording.json` 的 `title` 解析時間，保留固定檔名後的 HAR 對齊能力。
- Evidence:
  - `npm run timeline:prepare`
  - round1 實跑結果：
    - `Prepared round1: 82 slices / 146 HAR / 357 recording`
  - 缺檔時錯誤訊息已改為明確指出缺少哪一個 canonical 檔名。
- Decision: feasible

### FEEDBACK
- Positive: 把契約收斂成固定三檔後，新增 round 的流程明顯更可說明，也比較不會因為來源檔名不同而再次走回猜測邏輯。
- Negative: 這條路線要求資料先整理成固定檔名，若未事先重命名就無法 prepare，彈性會比先前低。
- Evidence: `prepare-rounds.mjs` 的 fixed input 驗證、`timeline:prepare` 實跑輸出、README 新增的 round 操作說明。
- Next Run: 若後續 round 來源常常無法先整理命名，可補一個獨立「匯入/重命名」步驟，但不要把猜檔名邏輯再塞回 viewer prepare。

## Task B - 調整 viewer 操作面板與過濾

- Goal: 讓 timeline / control panel 的卷動責任更清楚，並補齊 group / HAR URL regex 過濾能力。
- Method:
  - 調整 viewer layout，讓 workspace 以 viewport 高度為基準，`timeline panel` 負責上下左右卷動，`control panel` 保持獨立卷動。
  - 在 `Source Directory` 下新增 group multiple select，預設為 `全部`，選特定 group 後只顯示該 group slices。
  - 在 HAR kinds 區塊新增 regex input，支援用 JavaScript regular expression 過濾 URL，並在 pattern 無效時顯示錯誤提示。
  - 同步補上 `selectedSlice` prop，避免 timeline 選取狀態在 template 中只靠未定義引用。
- Evidence:
  - `npm run timeline:build`
  - build 成功，代表新的 state / prop / template 串接已可編譯。
  - viewer 目前可同時套用：
    - HAR kinds checkbox
    - HAR URL regex
    - group multiple select
- Decision: feasible

### FEEDBACK
- Positive: group 與 HAR regex filter 是直接對人工判讀有幫助的控制項，沒有再引入新的資料模型複雜度，符合 POC 先降人工成本的方向。
- Negative: group filter 目前只看既有群組；如果群組本身沒整理好，filter 也只能局部幫忙。regex filter 也仍依賴使用者會寫 pattern。
- Evidence: `TimelineViewer.vue` 的 control panel 新欄位、`useTimelineModel.js` 的 group / regex 狀態與過濾邏輯、`base.css` 的 workspace 捲動配置、viewer build 成功。
- Next Run: 若後續 group 使用頻率高，可再補「未分組」選項與 selected group count，讓整理者更快知道目前正在看哪一批內容。

## Task C - 整理 round 管理流程

- Goal: 讓下一輪可直接建立、移除、重建 round，不需要靠口頭約定。
- Method:
  - 新增 repo root `scripts/manage-rounds.mjs`，提供 `add / remove / restart` 三個 round 管理指令。
  - root `package.json` 新增：
    - `timeline:round:add`
    - `timeline:round:remove`
    - `timeline:round:restart`
  - 把使用方式整理到 `README.md` 最上方與 `apps/timeline-viewer/README.md`。
- Evidence:
  - `npm run timeline:round:add -- round99`
  - `npm run timeline:round:remove -- round99`
  - `npm run timeline:round:restart -- round1`
  - round 管理腳本輸出已明確說明：
    - add 之後要放哪三個檔
    - restart 只會清 `artifacts / viewer / generated`
    - remove 會刪除整個 round 與 generated output
- Decision: feasible

### FEEDBACK
- Positive: 用明確腳本搭配 README，比單純寫說明更能降低下一輪誤操作機率，尤其是 restart 與 remove 的清理範圍可以直接固化。
- Negative: remove / restart 都是清理型操作，仍需要使用者知道自己要清掉哪個 round；這次只做了固定命名驗證，沒有額外加互動式保護。
- Evidence: `scripts/manage-rounds.mjs`、root `package.json` scripts、README 最上方的操作手冊、三個 round 管理指令的實跑輸出。
- Next Run: 若 round 數量開始變多，可再補 `list` 或 `status` 指令，讓使用者在清理前先看到目前有哪些 round 與哪些已 prepare。

## Task D - 驗證與文件同步

- Goal: 確認這次調整後 round1 仍能正常 prepare / build，並把規則同步到文件。
- Method:
  - 先跑 `npm run timeline:build` 驗證 viewer 端編譯。
  - 跑 `npm run timeline:prepare` 驗證固定三檔契約下的 round1 重建。
  - 更新 `README.md`、`apps/timeline-viewer/README.md`、`issue/issue-6/plan.md` 與本檔。
- Evidence:
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-6/plan.md`
  - `issue/issue-6/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 這次把使用入口、契約與驗證證據放在同一輪文件裡，下一次接手時不需要再從程式碼逆推 round 怎麼建立。
- Negative: 目前驗證仍以 round1 為主，group / regex 的實際人工節省效果還缺少跨 round 觀察。
- Evidence: build / prepare 指令成功、README 與 issue 文件同步更新。
- Next Run: 找至少一個新的 round 做完整 add -> prepare -> review -> restart 流程，確認這套入口不只適用 round1。
