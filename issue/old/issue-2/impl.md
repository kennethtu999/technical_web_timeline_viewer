# Issue 2 - 登入頁三方對齊點驗證

## Status

部分執行中。

本輪先補強 `錄影 -> 頁面代表圖 -> 時間錨點` 這條輔助路線，讓登入頁三方對齊更容易落地。

## Task D / Task E - 影片切圖工具清理與時間錨點輸出

- Goal: 把 `tools/video-to-images` 從單純切圖工具，整理成可支援 `VIDEO / HAR / Recording` 對齊的頁面圖與時間索引工具。
- Method:
  - 重構 `tools/video-to-images/screenshot.py`，保留場景切圖能力。
  - 新增每支影片的 `manifest.json` 與 `manifest.csv`。
  - 每張圖記錄 `frame`、`start_seconds`、`relative_timecode`，並支援可選的 `--video-start` 產生 `absolute_timestamp`。
  - 保留 `page_hint`、`review_note` 欄位，讓人工可以標記哪一張圖是 `login-page` 等頁面。
  - 重寫 `tools/video-to-images/README.md`，把工具定位改成「頁面圖 + 時間錨點」的半自動對齊輔助工具。
- Evidence:
  - `tools/video-to-images/screenshot.py` 已能定義結構化輸出欄位與 `summary.json`。
  - `tools/video-to-images/README.md` 已明確說明如何用 `page_hint` + `absolute_timestamp` 回推登入頁對齊點。
  - `source/round1/螢幕錄影 2026-04-17 上午11.21.22.mp4`
  - `source/round1/192.168.53.54.har`
  - `source/round1/Recording 2026_4_17 at 上午11_21_38.json`
  - 實跑 `python3 tools/video-to-images/screenshot.py --input 'source/round1/螢幕錄影 2026-04-17 上午11.21.22.mp4' --output issue/issue-2/artifacts/video-pages --threshold 1 --minlen 15 --video-start '2026-04-17 11:21:22'`
  - 成功輸出 `397` 張場景代表圖與 `manifest.json` / `manifest.csv`
  - 首次登入前後可在影片中看到：
    - `scene-0018`：登入頁輸入區
    - `scene-0020`：驗證碼已輸入、游標停在 `登入`
    - `scene-0021`：登入後儀表板
    - `scene-0024`：登入後帳戶查詢頁
  - 詳細觀察整理於 `issue/issue-2/artifacts/video-pages/login-anchor-notes.md`
- Decision: feasible

### FEEDBACK
- Positive: 工具已能直接從樣本錄影產出頁面圖與時間索引，並且成功把登入頁到登入後畫面收斂到幾張可人工判讀的關鍵圖，明顯降低了人工找畫面的成本。
- Negative: `absolute_timestamp` 直接套用錄影檔名時間時，和 HAR login submit 仍有數秒級落差，因此目前只能當作校準輔助，不能當成最終精準時鐘；另外第二筆 HAR login submit 對到的最近畫面不是可見登入頁，仍需和 Recording 一起人工複核。
- Evidence: `issue/issue-2/artifacts/video-pages/summary.json`、`issue/issue-2/artifacts/video-pages/螢幕錄影 2026-04-17 上午11.21.22/manifest.json`、`issue/issue-2/artifacts/video-pages/login-anchor-notes.md`、以及首批關鍵場景 `scene-0018`、`scene-0020`、`scene-0021`、`scene-0024`。
- Next Run: 用 Recording step 時序再校正一次 video 起始偏移量，將 `scene-0018` 到 `scene-0024` 標成首批 `login-anchor`，並把第二筆 HAR login submit 與當時的 Recording step / redirect chain 一起比對，確認它是重登入、背景請求，還是 session 對齊偏移。
