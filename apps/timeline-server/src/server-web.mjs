import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyRoundWithBaseline,
  listPreparedRounds,
  readBaselinePageLogin,
  readRoundMeta,
  readRoundTimeline,
  readRoundViewerState,
  runPreviewCapture,
  writeRoundViewerState,
} from "./lib/prepare.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const sourceRoot = path.join(repoRoot, "source");
const port = Number(process.env.TIMELINE_SERVER_PORT || 4174);

const CONTENT_TYPE_BY_EXT = {
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function formatDurationMs(startTimeNs) {
  return `${(Number(process.hrtime.bigint() - startTimeNs) / 1_000_000).toFixed(1)}ms`;
}

function getRemoteAddress(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function logRequestStart(req) {
  console.log(
    `[http] --> ${new Date().toISOString()} ${req.method || "UNKNOWN"} ${req.url || "/"} ip=${getRemoteAddress(req)}`
  );
}

function logRequestFinish(req, res, startTimeNs, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  console.log(
    `[http] <-- ${new Date().toISOString()} ${req.method || "UNKNOWN"} ${req.url || "/"} status=${res.statusCode} duration=${formatDurationMs(startTimeNs)}${suffix}`
  );
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readJsonBody(req) {
  const rawBody = await readBody(req);
  return rawBody ? JSON.parse(rawBody) : {};
}

function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function safeAssetPath(roundId, assetSubPath) {
  const roundRoot = path.join(sourceRoot, roundId);
  const normalizedAssetSubPath = path.normalize(assetSubPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidatePath = path.join(roundRoot, normalizedAssetSubPath);
  const relativePath = path.relative(roundRoot, candidatePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid asset path.");
  }
  return candidatePath;
}

async function serveAsset(res, roundId, assetSubPath) {
  const filePath = safeAssetPath(roundId, assetSubPath);
  const fileBuffer = await fs.readFile(filePath);
  const contentType = CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.end(fileBuffer);
}

const server = http.createServer(async (req, res) => {
  const startTimeNs = process.hrtime.bigint();
  logRequestStart(req);
  res.on("finish", () => {
    logRequestFinish(req, res, startTimeNs);
  });
  res.on("close", () => {
    if (!res.writableEnded) {
      logRequestFinish(req, res, startTimeNs, "aborted=true");
    }
  });

  applyCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!req.url) {
    sendText(res, 400, "Missing request URL.");
    return;
  }

  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        service: "timeline-server",
        now: new Date().toISOString(),
      });
      return;
    }

    if (pathname === "/api/round-index" && req.method === "GET") {
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        rounds: await listPreparedRounds(),
        writable: true,
      });
      return;
    }

    if (pathname === "/api/baseline/page-login" && req.method === "GET") {
      sendJson(res, 200, await readBaselinePageLogin());
      return;
    }

    const timelineMatch = pathname.match(/^\/api\/rounds\/([^/]+)\/timeline$/);
    if (timelineMatch && req.method === "GET") {
      sendJson(res, 200, await readRoundTimeline(timelineMatch[1]));
      return;
    }

    const stateMatch = pathname.match(/^\/api\/rounds\/([^/]+)\/state$/);
    if (stateMatch && req.method === "GET") {
      sendJson(res, 200, await readRoundViewerState(stateMatch[1]));
      return;
    }

    if (stateMatch && req.method === "POST") {
      sendJson(res, 200, await writeRoundViewerState(stateMatch[1], await readJsonBody(req)));
      return;
    }

    const previewMatch = pathname.match(/^\/api\/rounds\/([^/]+)\/baseline\/preview$/);
    if (previewMatch && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        await runPreviewCapture({
          roundId: previewMatch[1],
          startSec: body.startSec,
          endSec: body.endSec,
          capturePointsSec: body.capturePointsSec,
        })
      );
      return;
    }

    const applyMatch = pathname.match(/^\/api\/rounds\/([^/]+)\/baseline\/apply$/);
    if (applyMatch && req.method === "POST") {
      const roundMeta = await applyRoundWithBaseline({
        roundId: applyMatch[1],
      });
      sendJson(res, 200, {
        ok: true,
        round: roundMeta,
      });
      return;
    }

    const metaMatch = pathname.match(/^\/api\/rounds\/([^/]+)\/meta$/);
    if (metaMatch && req.method === "GET") {
      sendJson(res, 200, await readRoundMeta(metaMatch[1]));
      return;
    }

    const assetMatch = pathname.match(/^\/assets\/rounds\/([^/]+)\/(.+)$/);
    if (assetMatch && req.method === "GET") {
      await serveAsset(res, assetMatch[1], assetMatch[2]);
      return;
    }

    sendJson(res, 404, {
      error: `Unknown route: ${pathname}`,
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`timeline-server listening on http://127.0.0.1:${port}`);
});
