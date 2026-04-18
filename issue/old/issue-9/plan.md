# Issue 9 - HAR 項目展開 Request/Response/Header 明細

本 issue 承接目前已可在 timeline viewer 中查看 HAR 摘要卡片的工作台，聚焦補上「點選 HAR 項目即可在下方展開明細 panel，再點一次收起」的互動，讓人工驗證時不必離開 timeline 也能直接檢查 request / response / headers。

執行結果請寫入同目錄的 [impl.md](./impl.md)。

## 1. 背景

目前 HAR 水道只顯示：

- kind
- method / status
- pathname
- duration

這代表使用者雖能看到某筆 HAR 發生了什麼請求，但仍看不到：

- request body
- response body
- request / response headers

因此當人工驗證需要確認回應內容、送出的參數或 header 差異時，仍需離開 viewer 回頭開 HAR 原檔，增加查找成本，也削弱 timeline 作為三軸證據工作台的價值。

## 2. 目標

本 issue 要回答：

1. timeline viewer 是否能直接在 HAR 卡片下方展開 request / response / header 明細。
2. 同一筆 HAR 是否能透過再次點擊收起 detail panel。
3. `prepare` 產出的 `timeline.json` 是否能提供足夠的 HAR 明細摘要，同時維持 viewer 可用。

## 3. 執行項目

### Task A. 擴充 HAR event 明細資料

- Goal: 讓 timeline.json 內的 HAR event 能提供 panel 所需的 request / response / header 文字摘要。
- 預期輸出：
  - HAR event 新增 request detail
  - HAR event 新增 response detail
  - HAR event 新增 header detail
  - 大型文字內容有基本截斷與 fallback

### Task B. 補上 HAR detail toggle panel

- Goal: 點擊 HAR 卡片時，在該項目下方展開 detail panel，再點一次收起。
- 預期輸出：
  - HAR item 可切換 detail panel
  - panel 顯示 `Request / Response / Header`
  - 切換其它 HAR item 時可改看另一筆明細

### Task C. 文件與 issue 同步

- Goal: 讓下一輪知道 viewer 已支援 HAR 明細展開與目前限制。
- 預期輸出：
  - `README.md`
  - `apps/timeline-viewer/README.md`
  - `issue/issue-9/impl.md`

### Task D. 驗證與紀錄

- Goal: 確認修改後 viewer 仍可正常 build / prepare，並留下證據與 FEEDBACK。
- 預期輸出：
  - `npm run timeline:build`
  - `npm run timeline:prepare`
  - issue FEEDBACK 完整回填

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

1. 點擊 HAR 卡片後可在下方展開 detail panel。
2. panel 至少能顯示 Request / Response / Header 三區內容。
3. 再點同一筆 HAR 卡片時可收起。
4. `timeline:build` 與 `timeline:prepare` 仍可正常完成。

## 6. 風險

- HAR response body 可能很大，若不做截斷，timeline.json 與 UI 都可能變重。
- 某些 response content 可能是 base64 或非純文字，需保留解碼失敗或空內容 fallback。
- detail panel 展開後會拉高 HAR 水道高度，需避免蓋住其它元素或造成捲動混亂。
- 若未來資料量再放大，可能要改成懶載入或獨立 inspector，而不是把所有明細都預先放進 timeline.json。

## 7. 驗收重點

本 issue 驗收重點是：

- HAR 明細是否能在 timeline 內直接查看
- 同一筆點兩次是否能正常開關
- 切換不同 HAR 項目時是否能順利改看另一筆
- 文件與 issue 是否能讓下一輪明白這次新增的能力與限制
