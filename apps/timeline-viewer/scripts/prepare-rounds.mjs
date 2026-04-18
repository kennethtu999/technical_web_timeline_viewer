import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const sourceRoot = path.join(repoRoot, "source");
const publicGeneratedRoot = path.join(appRoot, "public/generated");
const baselineRoot = path.join(sourceRoot, "baseline");

const JSF_KIND_COLORS = {
  "document-get": "#1f6feb",
  "document-post": "#e07a1f",
  ajax: "#0c8b6f",
};
const DEFAULT_REQUEST_KINDS = ["document-get", "document-post", "ajax"];
const ALL_GROUPS_VALUE = "__all__";
const DEFAULT_ZOOM = 0.05;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 0.18;
const HAR_DETAIL_TEXT_LIMIT = 12000;
const HAR_HEADER_LINE_LIMIT = 120;
const CAPTURE_OFFSET_AFTER_RESPONSE_MS = 500;
const CAPTURE_OFFSET_BEFORE_REQUEST_MS = 500;
const CAPTURE_RULE_VERSION = 1;
const SAMPLING_DURATION_SECONDS = 10;
const SAMPLING_INTERVAL_SECONDS = 1;
const HTML_CAPTURE_CONTENT_TYPE_PREFIX = "text/htm";
const BASELINE_FILES = {
  image: "page_login.jpg",
  config: "page_login.json",
};
const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const CANONICAL_INPUTS = {
  video: "video.mp4",
  har: "network.har",
  recording: "recording.json",
};

function createDefaultViewerState(roundId) {
  return {
    version: 2,
    roundId,
    startAnchor: null,
    endAnchor: null,
    hiddenSliceIds: [],
    offsets: {},
    zoom: DEFAULT_ZOOM,
    selectedGroupIds: [ALL_GROUPS_VALUE],
    requestKindFilter: [...DEFAULT_REQUEST_KINDS],
    requestUrlPattern: "",
    updatedAt: null,
  };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resetDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf-8");
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function copyDir(sourceDir, targetDir) {
  await ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      const resolvedSource = await fs.realpath(sourcePath);
      await fs.copyFile(resolvedSource, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function getRoundIds() {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^round\d+$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftNumber = Number(left.replace(/^\D+/g, ""));
      const rightNumber = Number(right.replace(/^\D+/g, ""));
      return leftNumber - rightNumber;
    });
}

async function detectRoundInputs(roundId) {
  const roundRoot = path.join(sourceRoot, roundId);
  const inputPaths = {
    roundRoot,
    video: path.join(roundRoot, CANONICAL_INPUTS.video),
    har: path.join(roundRoot, CANONICAL_INPUTS.har),
    recording: path.join(roundRoot, CANONICAL_INPUTS.recording),
  };

  const missingFiles = [];
  for (const [inputKey, inputPath] of Object.entries(inputPaths)) {
    if (inputKey === "roundRoot") {
      continue;
    }

    if (!(await fileExists(inputPath))) {
      missingFiles.push(path.basename(inputPath));
    }
  }

  if (missingFiles.length) {
    throw new Error(
      `Missing required inputs in source/${roundId}: ${missingFiles.join(", ")}. ` +
        `Each round must provide exactly ${CANONICAL_INPUTS.video}, ${CANONICAL_INPUTS.har}, and ${CANONICAL_INPUTS.recording}.`
    );
  }

  return inputPaths;
}

async function detectBaselineInputs() {
  const configPath = path.join(baselineRoot, BASELINE_FILES.config);
  const imagePath = path.join(baselineRoot, BASELINE_FILES.image);
  const hasConfig = await fileExists(configPath);
  const hasImage = await fileExists(imagePath);
  const config = hasConfig ? JSON.parse(await readText(configPath)) : null;

  return {
    root: baselineRoot,
    configPath,
    imagePath,
    hasConfig,
    hasImage,
    config,
    videoOffsetMs: Number(config?.video_offset_ms || 0),
  };
}

function normalizeBaselineRule(rule) {
  if (!rule || typeof rule !== "object") {
    return null;
  }

  const uri = String(rule.uri || "").trim();
  const type = String(rule.type || "").trim().toUpperCase();
  if (!uri) {
    return null;
  }

  return {
    ...rule,
    uri,
    type,
  };
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function matchRequestUrlWithRule(url, ruleUri) {
  const rawUrl = String(url || "");
  if (!rawUrl || !ruleUri) {
    return false;
  }

  if (ruleUri.includes("://")) {
    return rawUrl.startsWith(ruleUri);
  }

  const parsed = safeUrl(rawUrl);
  if (!parsed) {
    return rawUrl.includes(ruleUri);
  }

  return parsed.pathname === ruleUri || rawUrl.includes(ruleUri);
}

function matchesBaselineHarRule(entry, rule) {
  const normalizedRule = normalizeBaselineRule(rule);
  if (!normalizedRule) {
    return false;
  }

  const method = String(entry.request?.method || "").toUpperCase();
  if (normalizedRule.type && normalizedRule.type !== method) {
    return false;
  }

  return matchRequestUrlWithRule(entry.request?.url || "", normalizedRule.uri);
}

function buildBaselineConfigSummary(config) {
  if (!config) {
    return null;
  }

  return {
    videoOffsetMs: Number(config.video_offset_ms || 0),
    showLoginPage: normalizeBaselineRule(config.show_login_page),
    submitLoginPage: normalizeBaselineRule(config.submit_login_page),
    recording: config.submit_login_page?.recording || null,
  };
}

function normalizePositiveInteger(value) {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function extractLocalizedTimestamp(rawText) {
  if (!rawText) {
    return null;
  }

  const match = rawText.match(
    /(?<year>\d{4})[-_/](?<month>\d{1,2})[-_/](?<day>\d{1,2}).*?(?<ampm>上午|下午)\s*(?<hour>\d{1,2})[.:_](?<minute>\d{1,2})[.:_](?<second>\d{1,2})/
  );

  if (!match?.groups) {
    return null;
  }

  let hour = Number(match.groups.hour);
  if (match.groups.ampm === "下午" && hour < 12) {
    hour += 12;
  }
  if (match.groups.ampm === "上午" && hour === 12) {
    hour = 0;
  }

  const parts = {
    year: match.groups.year,
    month: String(Number(match.groups.month)).padStart(2, "0"),
    day: String(Number(match.groups.day)).padStart(2, "0"),
    hour: String(hour).padStart(2, "0"),
    minute: String(Number(match.groups.minute)).padStart(2, "0"),
    second: String(Number(match.groups.second)).padStart(2, "0"),
  };

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseLocalizedTimestampToMs(formattedTimestamp) {
  if (!formattedTimestamp) {
    return null;
  }

  const match = formattedTimestamp.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$/
  );
  if (!match?.groups) {
    return null;
  }

  const {
    year,
    month,
    day,
    hour,
    minute,
    second,
  } = match.groups;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  ).getTime();
}

function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function cleanSelector(selector) {
  if (!selector) {
    return "unknown";
  }

  return selector
    .replace(/^aria\//, "")
    .replace(/\[role="textbox"\]/g, "")
    .replace(/\[role="button"\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRecordingLabel(step, index) {
  if (step.type === "navigate") {
    try {
      const url = new URL(step.url);
      return `Navigate ${url.pathname}`;
    } catch {
      return `Navigate ${step.url}`;
    }
  }

  if (step.type === "click" || step.type === "change") {
    const rawSelector =
      step.selectors?.[0]?.[0] || step.selectors?.[0]?.[1] || step.target || "unknown";
    const selectorLabel = cleanSelector(rawSelector);
    if (step.type === "change") {
      return `${selectorLabel} = ${String(step.value || "").slice(0, 32)}`;
    }
    return `Click ${selectorLabel}`;
  }

  return `${index + 1}. ${step.type}`;
}

function getResponseContentType(entry) {
  const fromContent = entry.response?.content?.mimeType;
  if (fromContent) {
    return String(fromContent);
  }

  const contentTypeHeader = (entry.response?.headers || []).find(
    (header) => String(header.name || "").toLowerCase() === "content-type"
  )?.value;
  return String(contentTypeHeader || "");
}

function hasHtmlCaptureContentType(entry) {
  return getResponseContentType(entry).trim().toLowerCase().startsWith(HTML_CAPTURE_CONTENT_TYPE_PREFIX);
}

function classifyHarEntry(entry) {
  const request = entry.request || {};
  const response = entry.response || {};
  const method = String(request.method || "GET").toUpperCase();
  const url = request.url || "";
  const pathname = safePathname(url);
  const mimeType = getResponseContentType(entry);
  const postDataText = request.postData?.text || "";
  const facesRequestHeader = (request.headers || []).find(
    (header) => String(header.name).toLowerCase() === "faces-request"
  )?.value;

  const looksLikeAjax =
    url.includes("ajax4jsf") ||
    postDataText.includes("AJAXREQUEST") ||
    String(facesRequestHeader || "").toLowerCase().includes("partial/ajax");

  if (looksLikeAjax) {
    return "ajax";
  }

  if (method === "POST") {
    return "document-post";
  }

  const looksLikeDocumentGet =
    method === "GET" &&
    (mimeType.includes("html") ||
      pathname.endsWith(".jsp") ||
      pathname.endsWith(".faces") ||
      pathname.endsWith(".cache"));

  if (looksLikeDocumentGet) {
    return "document-get";
  }

  return null;
}

function formatRelativeTimecode(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);
  const milliseconds = safeMs % 1_000;
  return `${String(hours).padStart(2, "0")}-${String(minutes).padStart(2, "0")}-${String(
    seconds
  ).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function decodeHtmlEntities(text) {
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalizedEntity = String(entity || "").toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      if (!Number.isFinite(codePoint)) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      if (!Number.isFinite(codePoint)) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }

    return HTML_ENTITY_MAP[normalizedEntity] ?? match;
  });
}

function truncateHarDetailText(text, limit = HAR_DETAIL_TEXT_LIMIT) {
  const normalizedText = decodeHtmlEntities(text);
  if (!normalizedText) {
    return "";
  }

  if (normalizedText.length <= limit) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, limit)}\n\n[truncated ${normalizedText.length - limit} chars]`;
}

function formatHarHeaders(headers) {
  const normalizedHeaders = Array.isArray(headers) ? headers : [];
  if (!normalizedHeaders.length) {
    return "(none)";
  }

  const lines = normalizedHeaders
    .slice(0, HAR_HEADER_LINE_LIMIT)
    .map(
      (header) =>
        `${decodeHtmlEntities(header.name || "(unnamed)")}: ${decodeHtmlEntities(
          header.value || ""
        )}`
    );

  if (normalizedHeaders.length > HAR_HEADER_LINE_LIMIT) {
    lines.push(`[truncated ${normalizedHeaders.length - HAR_HEADER_LINE_LIMIT} header lines]`);
  }

  return lines.join("\n");
}

function formatHarQueryString(queryString) {
  const items = Array.isArray(queryString) ? queryString : [];
  if (!items.length) {
    return "";
  }

  return items
    .map(
      (item) =>
        `${decodeHtmlEntities(item.name || "(unnamed)")}=${decodeHtmlEntities(item.value || "")}`
    )
    .join("\n");
}

function decodeHarResponseText(content) {
  const rawText = content?.text;
  if (!rawText) {
    return "";
  }

  if (String(content?.encoding || "").toLowerCase() !== "base64") {
    return rawText;
  }

  try {
    return Buffer.from(rawText, "base64").toString("utf-8");
  } catch {
    return "[base64 decode failed]";
  }
}

function looksLikeHtmlText(text, mimeType = "") {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("html") || normalizedMime.includes("xml")) {
    return true;
  }

  const sample = String(text || "").slice(0, 400);
  return /<\s*(html|body|head|div|span|table|tr|td|th|option|select|form|script|style)\b/i.test(
    sample
  );
}

function extractPlainTextFromHtml(text) {
  const decodedText = decodeHtmlEntities(text);
  const withBreaks = decodedText
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|header|footer|li|tr|td|th|h[1-6]|option|select|ul|ol|table|form|fieldset|label)\s*>/gi,
      "\n"
    )
    .replace(/<[^>]+>/g, " ");

  const normalizedLines = withBreaks
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return normalizedLines.join("\n");
}

function formatDetailMetaLines(entries) {
  return entries
    .filter(([, value]) => value != null && String(value) !== "")
    .map(([label, value]) => `${decodeHtmlEntities(label)}: ${decodeHtmlEntities(value)}`)
    .join("\n");
}

function buildHarRequestDetail(entry) {
  const request = entry.request || {};
  const queryString = formatHarQueryString(request.queryString);
  const postData = request.postData || {};
  const bodyText = truncateHarDetailText(postData.text || "");
  const meta = formatDetailMetaLines([
    ["Method", request.method || "GET"],
    ["URL", request.url || ""],
    ["HTTP", request.httpVersion || ""],
    ["Body MIME", postData.mimeType || ""],
  ]);

  const sections = [meta];
  if (queryString) {
    sections.push(`Query\n${truncateHarDetailText(queryString)}`);
  }
  sections.push(`Body\n${bodyText || "(empty)"}`);

  return sections.filter(Boolean).join("\n\n");
}

function buildHarResponseDetail(entry) {
  const response = entry.response || {};
  const content = response.content || {};
  const bodyText = truncateHarDetailText(decodeHarResponseText(content));
  const meta = formatDetailMetaLines([
    ["Status", response.status ?? 0],
    ["Status Text", response.statusText || ""],
    ["Redirect", response.redirectURL || ""],
    ["MIME", getResponseContentType(entry)],
    ["Encoding", content.encoding || ""],
    ["Body Size", content.size ?? ""],
  ]);

  return [meta, `Body\n${bodyText || "(empty)"}`].filter(Boolean).join("\n\n");
}

function buildHarResponseText(entry) {
  const content = entry.response?.content || {};
  const mimeType = getResponseContentType(entry);
  const rawBodyText = decodeHarResponseText(content);
  const readableText = looksLikeHtmlText(rawBodyText, mimeType)
    ? extractPlainTextFromHtml(rawBodyText)
    : rawBodyText;

  return truncateHarDetailText(readableText) || "(empty)";
}

function buildHarHeaderDetail(entry) {
  return [
    "Request Headers",
    formatHarHeaders(entry.request?.headers),
    "",
    "Response Headers",
    formatHarHeaders(entry.response?.headers),
  ].join("\n");
}

function findSliceByRelativeMs(slices, relativeMs) {
  if (!slices.length) {
    return null;
  }

  if (relativeMs <= slices[0].startMs) {
    return slices[0];
  }

  return (
    slices.find((slice) => relativeMs >= slice.startMs && relativeMs < slice.endMs) ||
    slices.at(-1)
  );
}

function findSliceByAbsoluteMs(slices, absoluteMs) {
  if (!slices.length) {
    return null;
  }

  const firstStart = new Date(slices[0].absoluteTimestamp).getTime();
  if (absoluteMs <= firstStart) {
    return slices[0];
  }

  return (
    slices.find((slice) => {
      const start = new Date(slice.absoluteTimestamp).getTime();
      const end = start + slice.durationMs;
      return absoluteMs >= start && absoluteMs < end;
    }) || slices.at(-1)
  );
}

function enrichRecordingEvents(recording, slices, durationMs) {
  const steps = recording.steps || [];
  const safeDurationMs = Math.max(1, Math.round(durationMs || 0));
  const stepCount = steps.length || 1;

  return steps
    .map((step, index) => {
      const approximateMs =
        stepCount === 1 ? 0 : Math.round((index / (stepCount - 1)) * safeDurationMs);
      const slice = findSliceByRelativeMs(slices, approximateMs);
      return {
        id: `recording-${index + 1}`,
        stepIndex: index + 1,
        type: step.type,
        label: buildRecordingLabel(step, index),
        approximateMs,
        targetSliceId: slice?.id ?? null,
        payload: step,
      };
    })
    .filter((event) => event.targetSliceId);
}

function buildHarEvent(entry, index) {
  const kind = classifyHarEntry(entry);
  if (!kind) {
    return null;
  }

  const startedAt = entry.startedDateTime;
  const absoluteMs = new Date(startedAt).getTime();
  if (!Number.isFinite(absoluteMs)) {
    return null;
  }

  const pathname = safePathname(entry.request?.url || "");
  return {
    id: `har-${index + 1}`,
    harEntryIndex: index + 1,
    kind,
    color: JSF_KIND_COLORS[kind],
    method: entry.request?.method || "GET",
    status: entry.response?.status || 0,
    url: entry.request?.url || "",
    pathname,
    absoluteTimestamp: startedAt,
    durationMs: Math.round(entry.time || 0),
    detail: {
      request: buildHarRequestDetail(entry),
      response: buildHarResponseDetail(entry),
      responseText: buildHarResponseText(entry),
      headers: buildHarHeaderDetail(entry),
    },
  };
}

function enrichHarEvents(har) {
  const entries = har.log?.entries || [];
  return entries
    .map((entry, index) => buildHarEvent(entry, index))
    .filter(Boolean);
}

function padIndex(index) {
  return String(index).padStart(4, "0");
}

function buildSliceId(sceneIndex, captureKind, offsetMs) {
  return `har-${padIndex(sceneIndex)}__${captureKind}__${formatRelativeTimecode(offsetMs)}`;
}

function normalizeCaptureKindLabel(captureKind) {
  if (captureKind === "get-after") {
    return "GET after";
  }
  if (captureKind === "post-before") {
    return "POST before";
  }
  if (captureKind === "post-after") {
    return "POST after";
  }
  return captureKind;
}

function buildCaptureSpecsForEntry(entry, index, baseline) {
  const method = String(entry.request?.method || "").toUpperCase();
  const url = entry.request?.url || "";
  const pathname = safePathname(url);
  const requestStartedAtMs = new Date(entry.startedDateTime).getTime();
  const responseTimeMs = Number(entry.time);
  const matchesShowLoginRule = matchesBaselineHarRule(entry, baseline.config?.show_login_page);
  const matchesSubmitLoginRule = matchesBaselineHarRule(entry, baseline.config?.submit_login_page);

  if (!Number.isFinite(requestStartedAtMs)) {
    return {
      candidates: [],
      skipped: [
        {
          harEntryIndex: index + 1,
          method,
          url,
          reason: "invalid-startedDateTime",
        },
      ],
    };
  }

  if (!hasHtmlCaptureContentType(entry)) {
    return {
      candidates: [],
      skipped: [
        {
          harEntryIndex: index + 1,
          method,
          url,
          reason: "non-html-content-type",
          contentType: getResponseContentType(entry),
        },
      ],
    };
  }

  if (method !== "GET" && method !== "POST") {
    return {
      candidates: [],
      skipped: [
        {
          harEntryIndex: index + 1,
          method,
          url,
          reason: "unsupported-method",
        },
      ],
    };
  }

  const baseInfo = {
    harEntryIndex: index + 1,
    sourceEventId: `har-${index + 1}`,
    method,
    url,
    pathname,
    requestStartedAtMs,
    responseReceivedAtMs: Number.isFinite(responseTimeMs)
      ? requestStartedAtMs + responseTimeMs
      : null,
    contentType: getResponseContentType(entry),
    matchesShowLoginRule,
    matchesSubmitLoginRule,
  };

  const specs = [];
  const skipped = [];

  if (method === "GET") {
    if (!Number.isFinite(responseTimeMs)) {
      skipped.push({
        ...baseInfo,
        reason: "missing-entry-time-for-get-after",
      });
    } else {
      specs.push({
        ...baseInfo,
        captureKind: "get-after",
        captureAtMs: requestStartedAtMs + responseTimeMs + CAPTURE_OFFSET_AFTER_RESPONSE_MS,
      });
    }
  }

  if (method === "POST") {
    specs.push({
      ...baseInfo,
      captureKind: "post-before",
      captureAtMs: requestStartedAtMs - CAPTURE_OFFSET_BEFORE_REQUEST_MS,
    });

    if (!Number.isFinite(responseTimeMs)) {
      skipped.push({
        ...baseInfo,
        reason: "missing-entry-time-for-post-after",
      });
    } else {
      specs.push({
        ...baseInfo,
        captureKind: "post-after",
        captureAtMs: requestStartedAtMs + responseTimeMs + CAPTURE_OFFSET_AFTER_RESPONSE_MS,
      });
    }
  }

  return {
    candidates: specs,
    skipped,
  };
}

function buildHarCaptureCandidates({ har, videoStartMs, videoDurationMs, baseline }) {
  const entries = har.log?.entries || [];
  const accepted = [];
  const skipped = [];
  const dedupeMap = new Map();

  for (const [index, entry] of entries.entries()) {
    const { candidates, skipped: skippedSpecs } = buildCaptureSpecsForEntry(
      entry,
      index,
      baseline
    );
    skipped.push(...skippedSpecs);

    for (const candidate of candidates) {
      const offsetMs = Math.round(candidate.captureAtMs - videoStartMs);

      if (offsetMs < 0) {
        skipped.push({
          ...candidate,
          offsetMs,
          reason: "capture-before-video-start",
        });
        continue;
      }

      if (offsetMs > videoDurationMs) {
        skipped.push({
          ...candidate,
          offsetMs,
          reason: "capture-after-video-end",
        });
        continue;
      }

      const dedupeSecond = Math.floor(candidate.captureAtMs / 1000);
      const dedupeKeyPrefix =
        candidate.matchesShowLoginRule || candidate.matchesSubmitLoginRule
          ? "baseline-login"
          : "normal";
      const dedupeKey = [
        dedupeKeyPrefix,
        dedupeSecond,
        candidate.captureKind,
        candidate.pathname,
      ].join("|");

      if (dedupeMap.has(dedupeKey)) {
        skipped.push({
          ...candidate,
          offsetMs,
          reason: "deduped-same-second-kind-pathname",
        });
        continue;
      }

      dedupeMap.set(dedupeKey, true);
      accepted.push({
        ...candidate,
        offsetMs,
      });
    }
  }

  accepted.sort((left, right) => {
    if (left.offsetMs !== right.offsetMs) {
      return left.offsetMs - right.offsetMs;
    }

    if (left.harEntryIndex !== right.harEntryIndex) {
      return left.harEntryIndex - right.harEntryIndex;
    }

    return left.captureKind.localeCompare(right.captureKind);
  });

  return {
    candidates: accepted.map((candidate) => ({
      ...candidate,
      pageHint: "",
      isLoginAnchor: false,
    })),
    skipped,
  };
}

function buildSlicesFromCaptureCandidates(candidates, roundId, videoDurationMs, baselineThumbnailName) {
  if (!candidates.length) {
    return [];
  }

  return candidates.map((candidate, index) => {
    const sceneIndex = index + 1;
    const nextCandidate = candidates[index + 1];
    const startMs = candidate.offsetMs;
    const nextStartMs = nextCandidate ? nextCandidate.offsetMs : videoDurationMs;
    const endMs = Math.max(startMs + 1, Math.min(videoDurationMs, nextStartMs));
    const imageFile = `har-${padIndex(candidate.harEntryIndex)}-${candidate.captureKind}.jpg`;
    const thumbnailSrc = candidate.isLoginAnchor && baselineThumbnailName
      ? `/generated/${roundId}/thumbnails/${baselineThumbnailName}`
      : `/generated/${roundId}/thumbnails/${imageFile}`;

    return {
      id: buildSliceId(sceneIndex, candidate.captureKind, candidate.offsetMs),
      sceneIndex,
      harEntryIndex: candidate.harEntryIndex,
      captureKind: candidate.captureKind,
      captureKindLabel: normalizeCaptureKindLabel(candidate.captureKind),
      method: candidate.method,
      url: candidate.url,
      pathname: candidate.pathname,
      requestStartedAt: new Date(candidate.requestStartedAtMs).toISOString(),
      responseReceivedAt: Number.isFinite(candidate.responseReceivedAtMs)
        ? new Date(candidate.responseReceivedAtMs).toISOString()
        : null,
      captureAt: new Date(candidate.captureAtMs).toISOString(),
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
      relativeTimecode: formatRelativeTimecode(candidate.offsetMs),
      absoluteTimestamp: new Date(candidate.captureAtMs).toISOString(),
      thumbnailSrc,
      imageFile,
      sourceEventId: candidate.sourceEventId,
      pageHint: candidate.pageHint || "",
      reviewNote: "",
      baseOffsetMs: 0,
      requestEvents: [],
      recordingEvents: [],
      groupIds: [],
      isLoginAnchor: Boolean(candidate.isLoginAnchor),
      matchesShowLoginRule: Boolean(candidate.matchesShowLoginRule),
      matchesSubmitLoginRule: Boolean(candidate.matchesSubmitLoginRule),
    };
  });
}

function attachEventToSliceUnique(slice, event) {
  if (!slice || !event) {
    return;
  }

  if (slice.requestEvents.some((existingEvent) => existingEvent.id === event.id)) {
    return;
  }

  slice.requestEvents.push(event);
}

function attachEventsToSlices(slices, harEvents, recordingEvents) {
  const sliceMap = new Map(slices.map((slice) => [slice.id, slice]));
  const sourceSliceMap = slices.reduce((result, slice) => {
    if (!result.has(slice.sourceEventId)) {
      result.set(slice.sourceEventId, []);
    }
    result.get(slice.sourceEventId).push(slice);
    return result;
  }, new Map());

  for (const event of harEvents) {
    const sourceSlices = sourceSliceMap.get(event.id) || [];
    for (const sourceSlice of sourceSlices) {
      attachEventToSliceUnique(sourceSlice, event);
    }

    const targetSlice = findSliceByAbsoluteMs(slices, new Date(event.absoluteTimestamp).getTime());
    attachEventToSliceUnique(targetSlice, event);
  }

  for (const event of recordingEvents) {
    sliceMap.get(event.targetSliceId)?.recordingEvents.push(event);
  }
}

function buildInitialGroups(slices) {
  const loginAnchorSlice = slices.find((slice) => slice.pageHint === "login-anchor");
  const groups = [];

  if (loginAnchorSlice) {
    groups.push({
      id: "group-login-anchor",
      label: "Login Anchor",
      color: "#c95f34",
      sliceIds: [loginAnchorSlice.id],
    });
  }

  for (const slice of slices) {
    slice.groupIds = groups
      .filter((group) => group.sliceIds.includes(slice.id))
      .map((group) => group.id);
  }

  return {
    groups,
    loginAnchorSlice,
  };
}

function matchesRecordingString(event, needle) {
  const normalizedNeedle = String(needle || "").trim();
  if (!normalizedNeedle) {
    return false;
  }

  const payloadText = JSON.stringify(event.payload || {});
  return [event.label, event.type, payloadText]
    .filter(Boolean)
    .some((text) => String(text).includes(normalizedNeedle));
}

function selectLoginAnchorSlice({ slices, recordingEvents, baseline }) {
  const showSlices = slices.filter(
    (slice) => slice.matchesShowLoginRule && slice.method === "GET" && slice.captureKind === "get-after"
  );
  if (!showSlices.length) {
    return {
      loginAnchorSlice: null,
      loginSubmitEntry: null,
      recordingHintCount: 0,
    };
  }

  const submitEntries = (baseline.har?.log?.entries || [])
    .map((entry, index) => {
      if (!matchesBaselineHarRule(entry, baseline.config?.submit_login_page)) {
        return null;
      }

      const absoluteMs = new Date(entry.startedDateTime).getTime();
      if (!Number.isFinite(absoluteMs)) {
        return null;
      }

      return {
        id: `har-${index + 1}`,
        harEntryIndex: index + 1,
        method: entry.request?.method || "",
        url: entry.request?.url || "",
        absoluteMs,
        targetSliceId: findSliceByAbsoluteMs(slices, absoluteMs)?.id ?? null,
      };
    })
    .filter(Boolean);

  const clickHint = String(
    baseline.config?.submit_login_page?.recording?.click?.string || ""
  ).trim();
  const clickOrder = normalizePositiveInteger(
    baseline.config?.submit_login_page?.recording?.click?.order
  );
  const recordingHintEvents = clickHint
    ? recordingEvents.filter((event) => matchesRecordingString(event, clickHint))
    : [];
  const prioritizedRecordingHintEvents =
    clickOrder && recordingHintEvents[clickOrder - 1]
      ? [recordingHintEvents[clickOrder - 1]]
      : recordingHintEvents;
  const orderMap = new Map(slices.map((slice, index) => [slice.id, index]));

  let selectedSubmitEntry = submitEntries[0] || null;

  if (selectedSubmitEntry && prioritizedRecordingHintEvents.length) {
    const bestMatch = submitEntries
      .map((entry) => {
        const sliceIndex = orderMap.get(entry.targetSliceId) ?? 0;
        const minDistance = prioritizedRecordingHintEvents.reduce((bestDistance, event) => {
          const eventSliceIndex = orderMap.get(event.targetSliceId);
          if (eventSliceIndex == null) {
            return bestDistance;
          }
          const distance = Math.abs(sliceIndex - eventSliceIndex);
          return Math.min(bestDistance, distance);
        }, Number.POSITIVE_INFINITY);

        return {
          entry,
          minDistance,
        };
      })
      .sort((left, right) => {
        if (left.minDistance !== right.minDistance) {
          return left.minDistance - right.minDistance;
        }

        return left.entry.absoluteMs - right.entry.absoluteMs;
      })[0];

    if (bestMatch?.entry) {
      selectedSubmitEntry = bestMatch.entry;
    }
  }

  const loginAnchorSlice = selectedSubmitEntry
    ? showSlices.filter((slice) => new Date(slice.absoluteTimestamp).getTime() <= selectedSubmitEntry.absoluteMs).at(-1) ||
      showSlices[0]
    : showSlices[0];

  return {
    loginAnchorSlice,
    loginSubmitEntry: selectedSubmitEntry,
    recordingHintCount: recordingHintEvents.length,
    recordingHintOrder: clickOrder,
    matchedRecordingHintOrder:
      clickOrder && recordingHintEvents[clickOrder - 1] ? clickOrder : null,
  };
}

function sanitizeAnchor(anchor, validSliceIds) {
  if (!anchor || !validSliceIds.has(anchor.sliceId)) {
    return null;
  }

  return {
    sliceId: anchor.sliceId,
    sourceType: anchor.sourceType || "slice",
    itemId: anchor.itemId || null,
    label: anchor.label || "",
  };
}

function normalizeSelectedGroupIds(nextIds, validGroupIds) {
  const sanitizedIds = Array.from(
    new Set(
      (Array.isArray(nextIds) ? nextIds : [nextIds]).filter(
        (groupId) => groupId === ALL_GROUPS_VALUE || validGroupIds.has(groupId)
      )
    )
  );

  if (!sanitizedIds.length || sanitizedIds.includes(ALL_GROUPS_VALUE)) {
    return [ALL_GROUPS_VALUE];
  }

  return sanitizedIds;
}

function normalizeRequestKindFilter(nextKinds) {
  if (!Array.isArray(nextKinds)) {
    return [...DEFAULT_REQUEST_KINDS];
  }

  return Array.from(
    new Set(nextKinds.filter((kind) => DEFAULT_REQUEST_KINDS.includes(kind)))
  );
}

function clampZoom(nextZoom) {
  const numericZoom = Number(nextZoom);
  if (!Number.isFinite(numericZoom)) {
    return DEFAULT_ZOOM;
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, numericZoom));
}

function sanitizeViewerState(rawState, roundId, validSliceIds, validGroupIds) {
  const fallback = createDefaultViewerState(roundId);
  const offsets = Object.entries(rawState?.offsets || {}).reduce((result, [sliceId, offset]) => {
    if (!validSliceIds.has(sliceId)) {
      return result;
    }

    const numericOffset = Number(offset || 0);
    if (!Number.isFinite(numericOffset) || numericOffset === 0) {
      return result;
    }

    result[sliceId] = numericOffset;
    return result;
  }, {});

  const hiddenSliceIds = Array.from(
    new Set((rawState?.hiddenSliceIds || []).filter((sliceId) => validSliceIds.has(sliceId)))
  );

  return {
    ...fallback,
    ...rawState,
    version: fallback.version,
    roundId,
    startAnchor: sanitizeAnchor(rawState?.startAnchor, validSliceIds),
    endAnchor: sanitizeAnchor(rawState?.endAnchor, validSliceIds),
    hiddenSliceIds,
    offsets,
    zoom: clampZoom(rawState?.zoom),
    selectedGroupIds: normalizeSelectedGroupIds(rawState?.selectedGroupIds, validGroupIds),
    requestKindFilter: normalizeRequestKindFilter(rawState?.requestKindFilter),
    requestUrlPattern: String(rawState?.requestUrlPattern || ""),
    updatedAt: rawState?.updatedAt || null,
  };
}

function buildSliceAnchor(slice) {
  if (!slice) {
    return null;
  }

  return {
    sliceId: slice.id,
    sourceType: "slice",
    itemId: slice.id,
    label: `${slice.relativeTimecode} · #${slice.sceneIndex}`,
  };
}

function probeVideoDurationMs(videoPath) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", videoPath],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    }
  );

  if (result.error) {
    throw new Error(`ffprobe failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`ffprobe failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }

  const payload = JSON.parse(result.stdout || "{}");
  const durationSeconds = Number(payload.format?.duration || 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Unable to read video duration from ffprobe for ${videoPath}`);
  }

  return Math.round(durationSeconds * 1000);
}

function extractFrameByOffset(videoPath, offsetSec, outputPath) {
  const formattedOffset = Number(offsetSec).toFixed(3);
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-ss", formattedOffset, "-i", videoPath, "-frames:v", "1", "-q:v", "2", outputPath],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    }
  );

  if (result.error) {
    throw new Error(`ffmpeg failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg frame extraction failed for ${path.basename(outputPath)}: ${String(
        result.stderr || result.stdout || ""
      ).trim()}`
    );
  }
}

async function buildSamplingFrames({ videoPath, artifactRoot, videoDurationMs }) {
  const samplingRoot = path.join(artifactRoot, "sampling");
  await resetDir(samplingRoot);

  const samplingFrames = [];
  const maxSecond = Math.min(
    SAMPLING_DURATION_SECONDS - 1,
    Math.max(0, Math.floor(videoDurationMs / 1000))
  );

  for (let second = 0; second <= maxSecond; second += SAMPLING_INTERVAL_SECONDS) {
    const outputFile = `sample-${String(second).padStart(2, "0")}s.jpg`;
    const outputPath = path.join(samplingRoot, outputFile);
    extractFrameByOffset(videoPath, second, outputPath);
    samplingFrames.push({
      second,
      offsetMs: second * 1000,
      imageFile: outputFile,
    });
  }

  return {
    samplingRoot,
    samplingFrames,
  };
}

async function runHarDrivenCaptures({
  roundId,
  inputPaths,
  har,
  videoStartMs,
  videoDurationMs,
  baseline,
  artifactRoot,
  viewerThumbnailsRoot,
}) {
  const artifactThumbnailsRoot = path.join(artifactRoot, "thumbnails");
  await resetDir(artifactThumbnailsRoot);
  await resetDir(viewerThumbnailsRoot);

  const { candidates, skipped } = buildHarCaptureCandidates({
    har,
    videoStartMs,
    videoDurationMs,
    baseline,
  });

  if (!candidates.length) {
    throw new Error(
      `No HAR-driven capture candidates were produced for ${roundId}. Check video_start, HAR content type, and capture rules.`
    );
  }

  const baselineThumbnailName = baseline.hasImage ? "login-anchor.jpg" : null;

  const slices = buildSlicesFromCaptureCandidates(
    candidates,
    roundId,
    videoDurationMs,
    baselineThumbnailName
  );

  return {
    slices,
    captureReport: null,
    skipped,
    baselineThumbnailName,
  };
}

async function finalizeHarDrivenCaptures({
  roundId,
  inputPaths,
  slices,
  skipped,
  baseline,
  artifactRoot,
  viewerThumbnailsRoot,
  artifactThumbnailsRoot,
  baselineThumbnailName,
  videoStartMs,
  videoDurationMs,
  loginAnchorSlice,
  loginSubmitSlice,
  recordingHintCount,
  recordingHintOrder,
  matchedRecordingHintOrder,
}) {
  const { samplingFrames } = await buildSamplingFrames({
    videoPath: inputPaths.video,
    artifactRoot,
    videoDurationMs,
  });

  if (loginAnchorSlice) {
    loginAnchorSlice.pageHint = "login-anchor";
    loginAnchorSlice.isLoginAnchor = true;
    if (baselineThumbnailName) {
      loginAnchorSlice.thumbnailSrc = `/generated/${roundId}/thumbnails/${baselineThumbnailName}`;
    }
  }

  for (const slice of slices) {
    const artifactOutputPath = path.join(artifactThumbnailsRoot, slice.imageFile);
    extractFrameByOffset(inputPaths.video, slice.startMs / 1000, artifactOutputPath);
    await fs.copyFile(artifactOutputPath, path.join(viewerThumbnailsRoot, slice.imageFile));
  }

  if (baselineThumbnailName) {
    await fs.copyFile(baseline.imagePath, path.join(artifactThumbnailsRoot, baselineThumbnailName));
    await fs.copyFile(baseline.imagePath, path.join(viewerThumbnailsRoot, baselineThumbnailName));
  }

  const captureReport = {
    generatedAt: new Date().toISOString(),
    captureRuleVersion: CAPTURE_RULE_VERSION,
    roundId,
    videoStart: new Date(videoStartMs).toISOString(),
    videoDurationMs,
    baseline: {
      configFile: baseline.hasConfig ? BASELINE_FILES.config : null,
      imageFile: baseline.hasImage ? BASELINE_FILES.image : null,
      config: buildBaselineConfigSummary(baseline.config),
      loginAnchorSliceId: loginAnchorSlice?.id ?? null,
      loginSubmitSliceId: loginSubmitSlice?.id ?? null,
      recordingHintCount,
      recordingHintOrder,
      matchedRecordingHintOrder,
    },
    summary: {
      captureCount: slices.length,
      skippedCount: skipped.length,
      samplingCount: samplingFrames.length,
    },
    sampling: samplingFrames,
    captures: slices.map((slice) => ({
      id: slice.id,
      harEntryIndex: slice.harEntryIndex,
      captureKind: slice.captureKind,
      method: slice.method,
      url: slice.url,
      pathname: slice.pathname,
      startMs: slice.startMs,
      endMs: slice.endMs,
      durationMs: slice.durationMs,
      imageFile: slice.imageFile,
      pageHint: slice.pageHint || "",
      sourceEventId: slice.sourceEventId,
    })),
    skipped,
  };

  await writeJson(path.join(artifactRoot, "captures.json"), captureReport);

  return {
    slices,
    captureReport,
  };
}

function buildRoundMeta({
  roundId,
  inputPaths,
  timeline,
  viewerState,
  baseline,
  videoStart,
  captureReport,
}) {
  const loginAnchorSlice = timeline.slices.find((slice) => slice.pageHint === "login-anchor");

  return {
    id: roundId,
    title: timeline.meta.title,
    sourceRound: roundId,
    sourceDir: `source/${roundId}`,
    viewerDir: `source/${roundId}/viewer`,
    generatedAt: timeline.meta.generatedAt,
    sliceCount: timeline.meta.sliceCount,
    requestEventCount: timeline.meta.requestEventCount,
    recordingEventCount: timeline.meta.recordingEventCount,
    durationMs: timeline.meta.durationMs,
    rawSceneCount: null,
    skippedOverlapCount: null,
    overlapRule: null,
    captureStrategy: {
      type: "har-driven",
      contentTypePrefix: HTML_CAPTURE_CONTENT_TYPE_PREFIX,
      getAfterResponseMs: CAPTURE_OFFSET_AFTER_RESPONSE_MS,
      postBeforeRequestMs: CAPTURE_OFFSET_BEFORE_REQUEST_MS,
      postAfterResponseMs: CAPTURE_OFFSET_AFTER_RESPONSE_MS,
      captureRuleVersion: CAPTURE_RULE_VERSION,
    },
    canonicalFiles: {
      video: {
        aliasName: CANONICAL_INPUTS.video,
        originalName: path.basename(inputPaths.video),
      },
      har: {
        aliasName: CANONICAL_INPUTS.har,
        originalName: path.basename(inputPaths.har),
      },
      recording: {
        aliasName: CANONICAL_INPUTS.recording,
        originalName: path.basename(inputPaths.recording),
      },
      loginAnchor: baseline.hasConfig || baseline.hasImage
        ? {
            sourceDir: "source/baseline",
            imageFile: baseline.hasImage ? BASELINE_FILES.image : null,
            configFile: baseline.hasConfig ? BASELINE_FILES.config : null,
            config: buildBaselineConfigSummary(baseline.config),
          }
        : null,
    },
    videoStart,
    loginAnchor: loginAnchorSlice
      ? {
          sliceId: loginAnchorSlice.id,
          url: loginAnchorSlice.url,
          thumbnailSrc: loginAnchorSlice.thumbnailSrc,
        }
      : null,
    captureSummary: captureReport.summary,
    viewerState: {
      startAnchor: viewerState.startAnchor,
      endAnchor: viewerState.endAnchor,
      hiddenSliceCount: viewerState.hiddenSliceIds.length,
      offsetSliceCount: Object.keys(viewerState.offsets).length,
      updatedAt: viewerState.updatedAt,
    },
  };
}

async function prepareRound(roundId) {
  const inputPaths = await detectRoundInputs(roundId);
  const baseline = await detectBaselineInputs();
  const roundRoot = inputPaths.roundRoot;
  const viewerRoot = path.join(roundRoot, "viewer");
  const viewerTimelinePath = path.join(viewerRoot, "timeline.json");
  const viewerStatePath = path.join(viewerRoot, "viewer-state.json");
  const viewerMetaPath = path.join(viewerRoot, "round-meta.json");
  const viewerThumbnailsRoot = path.join(viewerRoot, "thumbnails");
  const artifactRoot = path.join(roundRoot, "artifacts", "har-captures");
  const publicRoundRoot = path.join(publicGeneratedRoot, roundId);

  const [recording, har] = await Promise.all([
    readJson(inputPaths.recording),
    readJson(inputPaths.har),
  ]);
  const baselineContext = {
    ...baseline,
    har,
  };

  const videoStart =
    extractLocalizedTimestamp(recording?.title) ||
    extractLocalizedTimestamp(path.basename(inputPaths.video)) ||
    extractLocalizedTimestamp(path.basename(inputPaths.recording));
  const videoStartMs = parseLocalizedTimestampToMs(videoStart);

  if (!videoStart || !Number.isFinite(videoStartMs)) {
    throw new Error(
      `Unable to determine video_start for ${roundId}. HAR-driven capture requires a localized timestamp in recording title or canonical file names.`
    );
  }

  await ensureDir(artifactRoot);
  const videoDurationMs = probeVideoDurationMs(inputPaths.video);
  const effectiveVideoStartMs = videoStartMs + baseline.videoOffsetMs;
  const artifactThumbnailsRoot = path.join(artifactRoot, "thumbnails");
  const {
    slices,
    skipped,
    baselineThumbnailName,
  } = await runHarDrivenCaptures({
    roundId,
    inputPaths,
    har,
    videoStartMs: effectiveVideoStartMs,
    videoDurationMs,
    baseline: baselineContext,
    artifactRoot,
    viewerThumbnailsRoot,
  });

  const recordingEvents = enrichRecordingEvents(recording, slices, videoDurationMs);
  const {
    loginAnchorSlice,
    loginSubmitEntry,
    recordingHintCount,
    recordingHintOrder,
    matchedRecordingHintOrder,
  } = selectLoginAnchorSlice({
    slices,
    recordingEvents,
    baseline: baselineContext,
  });
  const { captureReport } = await finalizeHarDrivenCaptures({
    roundId,
    inputPaths,
    slices,
    skipped,
    baseline: baselineContext,
    artifactRoot,
    viewerThumbnailsRoot,
    artifactThumbnailsRoot,
    baselineThumbnailName,
    videoStartMs: effectiveVideoStartMs,
    videoDurationMs,
    loginAnchorSlice,
    loginSubmitSlice: loginSubmitEntry
      ? {
          id: loginSubmitEntry.id,
          harEntryIndex: loginSubmitEntry.harEntryIndex,
          url: loginSubmitEntry.url,
        }
      : null,
    recordingHintCount,
    recordingHintOrder,
    matchedRecordingHintOrder,
  });

  const harEvents = enrichHarEvents(har);
  attachEventsToSlices(slices, harEvents, recordingEvents);
  const { groups, loginAnchorSlice: groupedLoginAnchorSlice } = buildInitialGroups(slices);

  const validSliceIds = new Set(slices.map((slice) => slice.id));
  const validGroupIds = new Set(groups.map((group) => group.id));
  const existingViewerState = (await fileExists(viewerStatePath))
    ? await readJson(viewerStatePath)
    : createDefaultViewerState(roundId);
  let viewerState = sanitizeViewerState(existingViewerState, roundId, validSliceIds, validGroupIds);

  if (!viewerState.startAnchor && groupedLoginAnchorSlice) {
    viewerState = {
      ...viewerState,
      startAnchor: buildSliceAnchor(groupedLoginAnchorSlice),
    };
  }

  const timeline = {
    meta: {
      title: `${roundId.toUpperCase()} Timeline Viewer`,
      sourceRound: roundId,
      videoName: path.basename(inputPaths.video),
      sliceCount: slices.length,
      requestEventCount: harEvents.length,
      recordingEventCount: recordingEvents.length,
      durationMs: videoDurationMs,
      rawSceneCount: null,
      skippedOverlapCount: null,
      overlapRule: null,
      generatedAt: new Date().toISOString(),
      requestKinds: Object.keys(JSF_KIND_COLORS),
      canonicalFiles: {
        video: CANONICAL_INPUTS.video,
        har: CANONICAL_INPUTS.har,
        recording: CANONICAL_INPUTS.recording,
      },
      captureStrategy: {
        type: "har-driven",
        contentTypePrefix: HTML_CAPTURE_CONTENT_TYPE_PREFIX,
        getAfterResponseMs: CAPTURE_OFFSET_AFTER_RESPONSE_MS,
        postBeforeRequestMs: CAPTURE_OFFSET_BEFORE_REQUEST_MS,
        postAfterResponseMs: CAPTURE_OFFSET_AFTER_RESPONSE_MS,
        captureRuleVersion: CAPTURE_RULE_VERSION,
      },
    },
    groups,
    slices,
  };

  const roundMeta = buildRoundMeta({
    roundId,
    inputPaths,
    timeline,
    viewerState,
    baseline: baselineContext,
    videoStart: {
      inferred: videoStart,
      videoOffsetMs: baseline.videoOffsetMs,
      effective: new Date(effectiveVideoStartMs).toISOString(),
    },
    captureReport,
  });

  await writeJson(viewerTimelinePath, timeline);
  await writeJson(viewerStatePath, viewerState);
  await writeJson(viewerMetaPath, roundMeta);

  await resetDir(publicRoundRoot);
  await copyDir(viewerRoot, publicRoundRoot);

  console.log(
    `Prepared ${roundId}: ${timeline.meta.sliceCount} slices / ${timeline.meta.requestEventCount} HAR / ${timeline.meta.recordingEventCount} recording`
  );

  return roundMeta;
}

async function main() {
  const explicitRounds = process.argv.slice(2).filter(Boolean);
  const roundIds = explicitRounds.length ? explicitRounds : await getRoundIds();

  if (!roundIds.length) {
    throw new Error("No round directories found under source/.");
  }

  await ensureDir(publicGeneratedRoot);

  const roundSummaries = [];
  for (const roundId of roundIds) {
    roundSummaries.push(await prepareRound(roundId));
  }

  await writeJson(path.join(publicGeneratedRoot, "index.json"), {
    generatedAt: new Date().toISOString(),
    rounds: roundSummaries,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
