# Timeline Server

這是 `timeline-viewer` 對應的輕量後端，負責：

- round index / timeline / viewer state API
- 依 `submit_login_page.video_ms` 反推影片時間軸
- baseline 60 秒試轉
- 全量套用後重新 prepare round
- `/assets/rounds/round{n}/*` 靜態資產提供

## 指令

在 repo root：

```bash
npm run timeline:prepare
npm run timeline:server
npm run timeline:test
```

或在本目錄：

```bash
npm run prepare:rounds
npm run dev
npm test
```

## dev 模式

- `npm run dev` 會使用 `node --watch ./src/server-web.mjs`
- 異動 server 程式後會自動重啟

## API

- `GET /api/round-index`
- `GET /api/rounds/:roundId/timeline`
- `GET /api/rounds/:roundId/state`
- `POST /api/rounds/:roundId/state`
- `GET /api/baseline/page-login`
- `POST /api/rounds/:roundId/baseline/preview`
- `POST /api/rounds/:roundId/baseline/apply`

## Assets

- viewer 縮圖：`/assets/rounds/round{n}/viewer/thumbnails/*`
- baseline 試轉圖：`/assets/rounds/round{n}/preview/{jobId}/*`

## Baseline Config

`source/baseline/page_login.json` 除了 login 規則外，也可加入：

```json
{
  "submit_login_page": {
    "uri": "/EB/login/login.faces",
    "type": "POST",
    "video_ms": 24500
  },
  "exclude_url_exprs": [
    "TxPageHandler\\?taskID=FOO",
    "/legacy/noisy/page.faces"
  ]
}
```

- `submit_login_page.video_ms` 表示肉眼看到登入按鈕被按下的影片時間
- prepare 會用命中的 submit login HAR `POST` 的 `request-start - 0.5 秒` 反推 `effectiveVideoStartMs`
- 目前登入定位只保留這一條規則，不再使用 `video_offset_ms` 或 `submit_login_page.recording`
- `exclude_url_exprs` 會在 HAR capture candidate 階段排除符合的 URL
- 內容優先視為 regex；regex 失敗時退回 substring 比對
- baseline `show_login_page` / `submit_login_page` 仍會強制保留，不受排除名單影響

## 結構說明

- `src/server-web.mjs`
  - HTTP 入口
- `src/task-prepare.mjs`
  - prepare CLI
- `src/task-preview.mjs`
  - baseline 試轉 CLI
- `src/task-apply.mjs`
  - baseline 全量套用 CLI
- `src/lib/prepare.js`
  - 目前的共用 prepare orchestration 與 round / baseline / preview 共用邏輯
- `test/prepare.har-processing.test.js`
  - 驗證前 10 個 HAR 處理請求、對應 recording 與實際取圖秒數
