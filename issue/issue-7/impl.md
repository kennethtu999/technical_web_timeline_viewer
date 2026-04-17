# Issue 7 - 專案定位轉正式使用與套件識別同步

## Status

完成。

本檔記錄 root 套件識別調整、README / AGENTS 的專案定位同步，以及本輪 FEEDBACK。

## Task A - 更新 root package metadata

- Goal: 讓 root `package.json` 的 `name` 與 `description` 能正確描述本案用途。
- Method:
  - 補上 `description`，描述 round-based 證據整理與 timeline viewer 的用途。
- Evidence:
  - `package.json`
  - root 套件名稱已不再帶有 `POC` 意涵
  - root 套件描述已明確指出 migration validation 與 timeline viewer
- Decision: feasible

### FEEDBACK
- Positive: 直接用 root `package.json` 表明專案用途，能讓套件識別、腳本入口與文件名稱保持一致，降低接手誤解。
- Negative: `validation-workbench` 仍是偏工作台取向的命名，若未來範圍再擴大到更多非 viewer 流程，可能還需要再校正一次名稱。
- Evidence: `package.json` 的 `name` / `description` 異動。
- Next Run: 若未來會把更多驗證輸出或批次流程收進 root，建議再檢查名稱是否仍能涵蓋整體範圍。

## Task B - 同步 README 與 AI 入口規則

- Goal: 讓 `README.md` 與 `AGENTS.md` 不再以 POC 作為目前階段描述，但仍保留避免過度設計的原則。
- Method:
  - 更新 `README.md` 標題、目前階段、成功標準與下一步入口。
  - 更新 `AGENTS.md` 的開始前先讀、任務分類、工作原則、輸出期待與決策優先順序。
  - 保留「先支撐驗證、避免過度工程化」的核心原則。
- Evidence:
  - `README.md`
  - `AGENTS.md`
  - `issue/issue-7/plan.md`
- Decision: feasible

### FEEDBACK
- Positive: 先同步入口文件再改名，可以避免只有 package metadata 更新、但 README / AGENTS 還把專案當成 POC 的落差。
- Negative: 舊 issue 內容仍保留 POC 歷史語境，這是合理歷史紀錄，但若有人只看舊 issue 可能還是會混淆。
- Evidence: README 的階段與成功標準段落、AGENTS 的任務入口與工作原則段落、issue-7 新增的背景說明。
- Next Run: 若後續正式流程再擴大，可補一段「歷史上曾為 POC，現已轉正式使用」的說明，讓舊 issue 與新定位更容易銜接。

## Task C - 留下執行紀錄與 FEEDBACK

- Goal: 讓下一輪能清楚知道這次定位切換改了哪些內容、為何要改。
- Method:
  - 新增 `issue/issue-7/plan.md` 與本檔，記錄背景、目標、成功標準、風險與 FEEDBACK。
- Evidence:
  - `issue/issue-7/plan.md`
  - `issue/issue-7/impl.md`
- Decision: feasible

### FEEDBACK
- Positive: 把這次定位切換獨立成新 issue，比直接散落在 README 與 AGENTS 的單點修改更容易追溯。
- Negative: 本輪沒有額外做指令或 UI 驗證，因為修改範圍以 metadata 與文件為主；證據主要來自檔案內容一致性。
- Evidence: issue-7 的 plan / impl、README 與 AGENTS 同步結果。
- Next Run: 若之後還有「專案階段切換」等高層變更，建議都沿用 issue 留痕，避免只在文件上留下無脈絡的結果。
