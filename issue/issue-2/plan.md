# Issue 2 - 登入頁三方對齊點驗證

本 issue 聚焦在「登入頁」這一個高信心情境，目標是用最小範圍找出 `錄影 + HAR + Recording` 的三方對齊點，作為後續更大範圍對齊的基準錨點。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

在 `issue-1` 中，已確認：

- Recording 前段能清楚看到 `使用者代碼`、`使用者密碼`、`登入` 等登入相關操作。
- HAR 中存在明確的登入 submit 事件：`POST /EB/login/login.faces`。
- 其中至少一個 Recording 的 `登入` click 會伴隨 `navigation`，適合作為 submit 候選點。

因此，`issue-2` 改為聚焦驗證：

1. 是否能透過登入頁的 `使用者代碼`、`使用者密碼`、`登入` 動作，在 Recording 找到穩定對齊點。
2. 是否能用 HAR 的登入 submit 事件作為網路錨點。
3. 是否能回推錄影中的對應畫面時間點，形成三方共同錨點。

## 2. 核心假設

本 issue 的工作假設如下：

1. Recording 內會出現登入前的欄位輸入與 submit click。
2. HAR 內的 `POST /EB/login/login.faces` 可視為登入 submit 的高信心網路錨點。
3. 若能用 session 起始時間差換算，錄影中應能找到登入頁畫面與 submit 前後變化。
4. 若登入 submit 錨點成立，後續其他情境可沿用同樣方法做區段對齊。

## 3. 已知候選證據

### 3.1 Recording 候選步驟

依目前觀察，Recording 前段至少有以下候選：

- `step 9`：`change` `使用者代碼`
- `step 10`：`click` `使用者密碼`
- `step 11`：`change` `使用者密碼`
- `step 14`：`click` `登入`
- `step 23`：`click` `登入`，且帶有 `assertedEvents: navigation`

這代表 Recording 裡至少有一個較強的 submit 候選點，但也可能存在一次失敗登入與一次成功登入，需要區分。

### 3.2 HAR 候選事件

HAR 中已觀察到至少兩筆登入 submit：

- `2026-04-17T03:22:15.418Z` `POST /EB/login/login.faces` `302`
- `2026-04-17T03:25:45.691Z` `POST /EB/login/login.faces` `302`

其中 request body 內可見：

- `main:captchaText`
- `main:_idcl=main:login1`

`main:_idcl=main:login1` 很適合視為登入按鈕 submit 的直接網路證據。

### 3.3 錄影時間錨點

目前已知：

- 錄影檔名時間：`2026-04-17 11:21:22`
- Recording 檔名時間：`2026-04-17 11:21:38`
- HAR 第一筆時間：`2026-04-17 11:21:49.141`

可先用這三個 session 錨點粗估錄影中的登入時間範圍，再用畫面變化做人工校正。

## 4. Issue 目標

本 issue 要回答以下問題：

1. Recording 中哪一個 `登入` click 最可能對應 HAR 的登入 submit。
2. 是否能區分「失敗登入」、「確認後重試」與「成功登入」。
3. 是否能把 HAR submit 時間換算成錄影中的畫面時間點。
4. 是否能形成一個可重複使用的 `login-alignment-anchor`。

## 5. 執行項目

### Task A. 找出 Recording 的登入提交候選點

目標：鎖定與登入 submit 最相關的 step 範圍。

執行內容：

1. 盤點 `使用者代碼`、`使用者密碼`、`驗證碼`、`登入` 相關 step。
2. 比較各次 `登入` click 是否帶有 navigation 或後續流程切換。
3. 區分登入前輸入、提交、失敗提示、重新輸入、再次提交。

預期輸出：

- `recording-login-window`
- `candidate-submit-steps`

### Task B. 找出 HAR 的登入網路錨點

目標：確認哪一筆 HAR submit 對應到哪一次登入流程。

執行內容：

1. 萃取所有 `/EB/login/login.faces`。
2. 檢查 method、status、redirect target 與 request body。
3. 以 `main:_idcl=main:login1` 作為按鈕提交證據。
4. 比較前後 request 與 redirect 是否代表成功登入。

預期輸出：

- `har-login-submit-events`
- `har-login-success-chain`

### Task C. 建立 Recording 與 HAR 的登入對齊規則

目標：用登入 submit 建立最小可重複對齊規則。

執行內容：

1. 用欄位輸入與 `登入` click 建立 Recording 候選區段。
2. 用 HAR submit 與 redirect 建立網路區段。
3. 以「submit 前最近一次登入 click」與「submit 後首頁 / 功能頁載入」做匹配。
4. 將匹配結果標記為 `high`、`medium`、`manual-review`。

預期輸出：

- `login-correlation-rule`
- `login-anchor-confidence`

### Task D. 回推錄影時間點

目標：找到錄影中的登入頁與登入成功後頁面切換時間點。

執行內容：

1. 依 session 起始時間換算 HAR submit 落點。
2. 在錄影中擷取 submit 前後候選畫面。
3. 驗證是否能看到登入頁、提示訊息、成功跳轉畫面。
4. 確認錄影是否能作為第三方佐證錨點。

預期輸出：

- `video-login-checkpoints`
- `video-login-screenshots`

### Task E. 產出可重用的對齊錨點格式

目標：把登入頁對齊結果整理成後續情境可沿用的格式。

執行內容：

1. 定義 `anchor` 欄位格式。
2. 將 Recording step、HAR event、video timestamp 收斂成同一筆資料。
3. 明確標示信心度與人工確認需求。

預期輸出：

- `login-alignment-anchor.json`
- `login-alignment-notes.md`

## 6. 預期輸出格式

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

## 7. 成功標準

本 issue 若要算成功，至少需滿足：

1. 找出至少一個 `Recording 登入 click -> HAR login submit -> 錄影時間點` 的三方候選對齊點。
2. 能說明這個對齊點為何是 `high` 或 `medium` 信心。
3. 能區分至少一次失敗或中斷登入，與一次成功登入。
4. 能整理出可複用的 `login-alignment-anchor` 格式。

## 8. 風險

- Recording 中可能有多次 `登入` click，且不一定每次都成功。
- HAR request body 中實際帳密是加密或空值，不能直接用欄位值比對。
- 錄影可能受等待時間、彈窗或 DevTools 畫面干擾，不一定能直接看出 submit 瞬間。
- 若登入後導頁不只一層，單看第一個 redirect 可能不足以定義成功登入。

## 9. 驗收重點

本 issue 驗收時，重點不是把所有流程都對齊，而是確認登入是否能成為第一個穩定、可重複、可引用的三方對齊錨點。
