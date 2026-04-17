# video-to-images

這個工具目前整理成「影片切頁面圖 + 時間錨點索引」的 POC 輔助工具，目的不是直接辨識所有頁面，而是先把錄影切成可人工判讀的代表圖，並留下可回推的時間資料，讓 `VIDEO / HAR / Recording` 三方比對更容易。

適合的使用方式是：

1. 先用 `screenshot.py` 從錄影切出場景代表圖。
2. 讓人快速標記哪一張圖是 `登入頁`、`驗證碼頁`、`成功登入後首頁`。
3. 依 `manifest.csv` / `manifest.json` 內的時間點，回推影片相對秒數或絕對時間。
4. 再和 HAR 事件時間、Recording step 做人工半自動對齊。

這條路線的定位是：

- `feasible`：可明顯降低人工找畫面的成本。
- `partial automation`：仍需要人判斷「這張圖是哪一頁」。
- `good for POC`：足以支撐登入頁等高信心錨點的驗證，不必先做完整頁面辨識模型。

## 目前工具

### 1. `screenshot.py`

用途：

- 以場景變化切出代表圖。
- 若相鄰代表圖屬於上下卷動且與上一張圖有 `50%` 以上 overlap，預設略過下一張。
- 每支影片輸出一份 `manifest.json` 與 `manifest.csv`。
- 每張圖都會記錄：
  - `scene_index`
  - `start_frame`
  - `end_frame`
  - `start_seconds`
  - `relative_timecode`
  - `absolute_timestamp`（若有提供 `--video-start`）
  - `image_file`
  - `page_hint`
  - `review_note`

`manifest.json` 另外也會保留卷動去重資訊，包含：

- `raw_scene_count`
- `capture_count`
- `skipped_overlap_count`
- `skipped_captures`

其中 `page_hint`、`review_note` 會先留白，方便人工回填，例如：

- `page_hint=login-page`
- `page_hint=home-after-login`
- `review_note=畫面已顯示使用者代碼與密碼欄位`

### 2. `createfile.py`

這支程式仍保留做既有測報產生，但它不是目前三方對齊 POC 的主力工具。若本輪目標是 `VIDEO / HAR / Recording` 對齊，請優先使用 `screenshot.py`。

## 輸出結構

假設輸入是 `demo.mp4`，輸出大致如下：

```text
output/
├── demo/
│   ├── scene-0001__00-00-00.000__f000000.jpg
│   ├── scene-0002__00-00-12.367__f000371.jpg
│   ├── manifest.json
│   └── manifest.csv
└── summary.json
```

`manifest.csv` 可直接拿來人工標記頁面，`manifest.json` 則適合後續腳本處理。

## 使用方式

### 本機 Python

```bash
python screenshot.py \
  --input /app/source/round1/螢幕錄影.mp4 \
  --output /app/output/video-pages \
  --threshold 1 \
  --minlen 15 \
  --scroll-overlap-threshold 0.5 \
  --video-start "2026-04-17 11:21:22"
```

### Docker / Podman

先在此目錄建 image：

```bash
podman build -t testtool:latest .
```

或：

```bash
docker build -t testtool:latest .
```

執行：

```bash
podman run --rm \
  -v "/c/app/test:/app/test" \
  testtool:latest \
  python screenshot.py \
    --input /app/test/video \
    --output /app/test/output \
    --threshold 1 \
    --minlen 15 \
    --scroll-overlap-threshold 0.5 \
    --video-start "2026-04-17 11:21:22"
```

## 參數說明

- `--input`：單一影片檔或影片資料夾。
- `--output`：輸出目錄。每支影片會各自建立子目錄。
- `--threshold`：場景切換敏感度，越小越敏感。
- `--minlen`：最小場景長度，以 frame 計。
- `--scroll-overlap-threshold`：上下卷動畫面與上一張圖的 overlap 達到此比例時，略過下一張。預設 `0.5`，設 `0` 可停用。
- `--scroll-overlap-similarity`：套用卷動去重前，重疊區塊至少要達到的相似度。預設 `0.92`。
- `--video-start`：可選。若知道錄影開始時間，可直接帶入，輸出會附上 `absolute_timestamp`。

## 對齊建議流程

以登入頁為例，可以這樣做：

1. 用 `screenshot.py` 先切出場景圖。
2. 在 `manifest.csv` 內找出疑似 `login-page` 的畫面，人工填上 `page_hint`。
3. 讀取該列的 `relative_timecode` 或 `absolute_timestamp`。
4. 用這個時間去對 HAR 的 `POST /EB/login/login.faces` 與 Recording 的 `登入 click / navigation`。
5. 若登入頁圖與登入成功後圖都能對上，就能形成一個三方對齊錨點。

## 限制

- 這不是 OCR 或頁面語意辨識工具，無法自動知道「這一張一定是登入頁」。
- 場景切圖仍受錄影品質、彈窗、等待時間、DevTools 干擾。
- 若畫面變化很小，可能需要調整 `--threshold` 與 `--minlen`。
- `50% overlap` 是降低卷動畫面重複輸出的 heuristic，若頁面內容局部更新但版型仍很接近，仍可能需要人工回看 `skipped_captures`。
- `absolute_timestamp` 的準確度依賴 `--video-start` 是否正確。

## 為什麼這樣做

這個 POC 的目標不是一次完成完整產品，而是先回答：

- 錄影能不能穩定切出可判讀頁面圖？
- 人工只要做最少標註時，能不能回推出 HAR / Recording 的時間錨點？
- 這條半自動路線值不值得再工程化？

目前答案偏向：`可行，而且值得作為登入頁對齊的輔助工具`。
