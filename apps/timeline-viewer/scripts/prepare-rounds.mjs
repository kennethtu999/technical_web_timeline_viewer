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

function classifyHarEntry(entry) {
  const request = entry.request || {};
  const response = entry.response || {};
  const method = String(request.method || "GET").toUpperCase();
  const url = request.url || "";
  const pathname = safePathname(url);
  const mimeType = response.content?.mimeType || "";
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

function buildSliceMap(manifest, roundId) {
  return manifest.captures.map((capture) => {
    const startMs = Math.round(capture.start_seconds * 1000);
    const endMs = Math.round(capture.end_seconds * 1000);
    return {
      id: capture.image_file.replace(/\.jpg$/, ""),
      sceneIndex: capture.scene_index,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
      relativeTimecode: capture.relative_timecode,
      absoluteTimestamp: capture.absolute_timestamp,
      thumbnailSrc: `/generated/${roundId}/thumbnails/${capture.image_file}`,
      imageFile: capture.image_file,
      pageHint: capture.page_hint || "",
      reviewNote: capture.review_note || "",
      baseOffsetMs: 0,
      requestEvents: [],
      recordingEvents: [],
      groupIds: [],
    };
  });
}

function findSliceByRelativeMs(slices, relativeMs) {
  return (
    slices.find((slice) => relativeMs >= slice.startMs && relativeMs <= slice.endMs) ||
    slices.at(-1)
  );
}

function findSliceByAbsoluteMs(slices, absoluteMs) {
  return (
    slices.find((slice) => {
      if (!slice.absoluteTimestamp) {
        return false;
      }
      const start = new Date(slice.absoluteTimestamp).getTime();
      const end = start + slice.durationMs;
      return absoluteMs >= start && absoluteMs <= end;
    }) || null
  );
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
    lines.push(
      `[truncated ${normalizedHeaders.length - HAR_HEADER_LINE_LIMIT} header lines]`
    );
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
    ["MIME", content.mimeType || ""],
    ["Encoding", content.encoding || ""],
    ["Body Size", content.size ?? ""],
  ]);

  return [meta, `Body\n${bodyText || "(empty)"}`].filter(Boolean).join("\n\n");
}

function buildHarResponseText(entry) {
  const content = entry.response?.content || {};
  const rawBodyText = decodeHarResponseText(content);
  const readableText = looksLikeHtmlText(rawBodyText, content.mimeType)
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

function enrichRecordingEvents(recording, slices, manifest) {
  const steps = recording.steps || [];
  const durationMs = Math.round((manifest.duration_seconds || 0) * 1000);
  const stepCount = steps.length || 1;

  return steps
    .map((step, index) => {
      const approximateMs =
        stepCount === 1 ? 0 : Math.round((index / (stepCount - 1)) * durationMs);
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

function enrichHarEvents(har, slices) {
  const entries = har.log?.entries || [];

  return entries
    .map((entry, index) => {
      const kind = classifyHarEntry(entry);
      if (!kind) {
        return null;
      }

      const startedAt = entry.startedDateTime;
      const absoluteMs = new Date(startedAt).getTime();
      const slice = findSliceByAbsoluteMs(slices, absoluteMs);
      if (!slice) {
        return null;
      }

      const pathname = safePathname(entry.request?.url || "");
      return {
        id: `har-${index + 1}`,
        kind,
        color: JSF_KIND_COLORS[kind],
        method: entry.request?.method || "GET",
        status: entry.response?.status || 0,
        url: entry.request?.url || "",
        pathname,
        absoluteTimestamp: startedAt,
        targetSliceId: slice.id,
        durationMs: Math.round(entry.time || 0),
        detail: {
          request: buildHarRequestDetail(entry),
          response: buildHarResponseDetail(entry),
          responseText: buildHarResponseText(entry),
          headers: buildHarHeaderDetail(entry),
        },
      };
    })
    .filter(Boolean);
}

function attachEventsToSlices(slices, harEvents, recordingEvents) {
  const sliceMap = new Map(slices.map((slice) => [slice.id, slice]));

  for (const event of harEvents) {
    sliceMap.get(event.targetSliceId)?.requestEvents.push(event);
  }

  for (const event of recordingEvents) {
    sliceMap.get(event.targetSliceId)?.recordingEvents.push(event);
  }
}

function buildInitialGroups(slices) {
  const groups = [
    {
      id: "group-login-anchor",
      label: "Login Anchor Candidate",
      color: "#c95f34",
      sliceIds: slices
        .filter((slice) => slice.sceneIndex >= 18 && slice.sceneIndex <= 24)
        .map((slice) => slice.id),
    },
    {
      id: "group-second-submit-review",
      label: "Second Submit Review",
      color: "#3a7a6d",
      sliceIds: slices
        .filter((slice) => slice.sceneIndex >= 129 && slice.sceneIndex <= 133)
        .map((slice) => slice.id),
    },
  ].filter((group) => group.sliceIds.length > 0);

  for (const slice of slices) {
    slice.groupIds = groups
      .filter((group) => group.sliceIds.includes(slice.id))
      .map((group) => group.id);
  }

  return groups;
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

function buildRoundMeta({
  roundId,
  inputPaths,
  timeline,
  viewerState,
  manifest,
}) {
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
    rawSceneCount: manifest.raw_scene_count || timeline.meta.sliceCount,
    skippedOverlapCount: manifest.skipped_overlap_count || 0,
    overlapRule: {
      threshold: manifest.scroll_overlap_threshold || 0,
      similarity: manifest.scroll_overlap_similarity || 0,
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
    },
    viewerState: {
      startAnchor: viewerState.startAnchor,
      endAnchor: viewerState.endAnchor,
      hiddenSliceCount: viewerState.hiddenSliceIds.length,
      offsetSliceCount: Object.keys(viewerState.offsets).length,
      updatedAt: viewerState.updatedAt,
    },
  };
}

function runScreenshotTool({ screenshotTool, videoPath, outputRoot, videoStart }) {
  const args = [
    screenshotTool,
    "--input",
    videoPath,
    "--output",
    outputRoot,
    "--threshold",
    "0.5",
    "--minlen",
    "20",
    "--capture-offset-frames",
    "8",
    "--scroll-overlap-threshold",
    "0.7",
    "--scroll-overlap-similarity",
    "0.92",
  ];

  if (videoStart) {
    args.push("--video-start", videoStart);
  }

  console.log(`Preparing thumbnails from ${path.basename(videoPath)}...`);
  const result = spawnSync("python3", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`screenshot.py failed with exit code ${result.status}`);
  }
}

async function prepareRound(roundId) {
  const inputPaths = await detectRoundInputs(roundId);
  const roundRoot = inputPaths.roundRoot;
  const viewerRoot = path.join(roundRoot, "viewer");
  const viewerTimelinePath = path.join(viewerRoot, "timeline.json");
  const viewerStatePath = path.join(viewerRoot, "viewer-state.json");
  const viewerMetaPath = path.join(viewerRoot, "round-meta.json");
  const viewerThumbnailsRoot = path.join(viewerRoot, "thumbnails");
  const artifactRoot = path.join(roundRoot, "artifacts", "video-pages");
  const publicRoundRoot = path.join(publicGeneratedRoot, roundId);
  const videoStem = path.basename(inputPaths.video, path.extname(inputPaths.video));
  const manifestPath = path.join(artifactRoot, videoStem, "manifest.json");
  const [recording, har] = await Promise.all([
    readJson(inputPaths.recording),
    readJson(inputPaths.har),
  ]);
  const videoStart =
    extractLocalizedTimestamp(recording?.title) ||
    extractLocalizedTimestamp(path.basename(inputPaths.video)) ||
    extractLocalizedTimestamp(path.basename(inputPaths.recording));

  await ensureDir(artifactRoot);
  runScreenshotTool({
    screenshotTool: path.join(repoRoot, "tools/video-to-images/screenshot.py"),
    videoPath: inputPaths.video,
    outputRoot: artifactRoot,
    videoStart,
  });

  const [manifest] = await Promise.all([
    readJson(manifestPath),
  ]);

  const thumbnailsSourceRoot = path.join(artifactRoot, videoStem);
  await resetDir(viewerThumbnailsRoot);
  const artifactEntries = await fs.readdir(thumbnailsSourceRoot);
  for (const fileName of artifactEntries.filter((entry) => entry.endsWith(".jpg"))) {
    await fs.copyFile(
      path.join(thumbnailsSourceRoot, fileName),
      path.join(viewerThumbnailsRoot, fileName)
    );
  }

  const slices = buildSliceMap(manifest, roundId);
  const harEvents = enrichHarEvents(har, slices);
  const recordingEvents = enrichRecordingEvents(recording, slices, manifest);
  attachEventsToSlices(slices, harEvents, recordingEvents);
  const groups = buildInitialGroups(slices);

  const validSliceIds = new Set(slices.map((slice) => slice.id));
  const validGroupIds = new Set(groups.map((group) => group.id));
  const existingViewerState = (await fileExists(viewerStatePath))
    ? await readJson(viewerStatePath)
    : createDefaultViewerState(roundId);
  const viewerState = sanitizeViewerState(existingViewerState, roundId, validSliceIds, validGroupIds);

  const timeline = {
    meta: {
      title: `${roundId.toUpperCase()} Timeline Viewer`,
      sourceRound: roundId,
      videoName: manifest.video_name,
      sliceCount: slices.length,
      requestEventCount: harEvents.length,
      recordingEventCount: recordingEvents.length,
      durationMs: Math.round((manifest.duration_seconds || 0) * 1000),
      rawSceneCount: manifest.raw_scene_count || slices.length,
      skippedOverlapCount: manifest.skipped_overlap_count || 0,
      overlapRule: {
        threshold: manifest.scroll_overlap_threshold || 0,
        similarity: manifest.scroll_overlap_similarity || 0,
      },
      generatedAt: new Date().toISOString(),
      requestKinds: Object.keys(JSF_KIND_COLORS),
      canonicalFiles: {
        video: CANONICAL_INPUTS.video,
        har: CANONICAL_INPUTS.har,
        recording: CANONICAL_INPUTS.recording,
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
    manifest,
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
