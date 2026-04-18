import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const libRoot = path.resolve(__dirname, "..");
const srcRoot = path.resolve(libRoot, "..");
const appRoot = path.resolve(srcRoot, "..");

export const repoRoot = path.resolve(appRoot, "..", "..");
export const sourceRoot = path.join(repoRoot, "source");
export const baselineRoot = path.join(sourceRoot, "baseline");
export const DEFAULT_SYSTEM_ID = "esbgib";

export const JSF_KIND_COLORS = {
  "document-get": "#1f6feb",
  "document-post": "#e07a1f",
  ajax: "#0c8b6f",
};
export const DEFAULT_REQUEST_KINDS = ["document-get", "document-post", "ajax"];
export const ALL_GROUPS_VALUE = "__all__";
export const DEFAULT_ZOOM = 0.05;
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 0.18;
export const CAPTURE_RULE_VERSION = 1;
export const CAPTURE_OFFSET_AFTER_RESPONSE_MS = 500;
export const CAPTURE_OFFSET_BEFORE_REQUEST_MS = 500;
export const SAMPLING_DURATION_SECONDS = 10;
export const SAMPLING_INTERVAL_SECONDS = 1;
export const HTML_CAPTURE_CONTENT_TYPE_PREFIX = "text/htm";
export const HAR_DETAIL_TEXT_LIMIT = 12000;
export const HAR_HEADER_LINE_LIMIT = 120;
export const DEFAULT_PREVIEW_START_SEC = 0;
export const DEFAULT_PREVIEW_END_SEC = 60;

export const BASELINE_FILES = {
  image: "page_login.jpg",
};

export const ROUND_CONFIG_FILE = "round_config.json";

const ROUND_ID_REGEX = /^(?:[a-z0-9][a-z0-9_-]*_)?round\d+$/i;
const ROUND_ID_PARTS_REGEX = /^(?:([a-z0-9][a-z0-9_-]*)_)?round(\d+)$/i;

export const CANONICAL_INPUTS = {
  video: "video.mp4",
  har: "network.har",
  recording: "recording.json",
};

export function encodePathSegments(segments) {
  return segments.map((segment) => encodeURIComponent(String(segment))).join("/");
}

export function buildRoundAssetUrl(roundId, segments) {
  return `/assets/rounds/${encodeURIComponent(roundId)}/${encodePathSegments(segments)}`;
}

export function normalizeRoundId(rawValue) {
  const nextValue = String(rawValue || "").trim().toLowerCase();
  if (!ROUND_ID_REGEX.test(nextValue)) {
    throw new Error(
      `Invalid round id "${rawValue}". Use round{No} or {system}_round{No}, for example round2 or megageb_round1.`
    );
  }
  return nextValue;
}

function parseRoundId(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const parts = normalizedRoundId.match(ROUND_ID_PARTS_REGEX);
  if (!parts) {
    throw new Error(`Invalid round id "${roundId}".`);
  }

  return {
    normalizedRoundId,
    systemIdFromName: String(parts[1] || "").trim() || null,
    roundNumber: Number(parts[2]),
  };
}

export function extractRoundNumber(roundId) {
  return parseRoundId(roundId).roundNumber;
}

export function buildRoundKey(systemId, roundId) {
  const resolvedSystemId =
    String(systemId || inferRoundSystemId(roundId) || DEFAULT_SYSTEM_ID).trim() || DEFAULT_SYSTEM_ID;
  return `${resolvedSystemId}_round_${extractRoundNumber(roundId)}`;
}

export function getSystemDefaultConfigFileName(systemId) {
  return `${String(systemId || DEFAULT_SYSTEM_ID).trim()}_round_default.json`;
}

export function getRoundViewerRoot(roundId) {
  return path.join(sourceRoot, roundId, "viewer");
}

export function getRoundPreviewRoot(roundId) {
  return path.join(sourceRoot, roundId, "preview");
}

export function getRoundRoot(roundId) {
  return path.join(sourceRoot, roundId);
}

export function createDefaultViewerState(roundId) {
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

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function resetDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf-8");
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export async function getRoundIds() {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && ROUND_ID_REGEX.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftInfo = parseRoundId(left);
      const rightInfo = parseRoundId(right);

      if (leftInfo.systemIdFromName !== rightInfo.systemIdFromName) {
        return String(leftInfo.systemIdFromName || "").localeCompare(
          String(rightInfo.systemIdFromName || "")
        );
      }

      return leftInfo.roundNumber - rightInfo.roundNumber;
    });
}

export function inferRoundSystemId(roundId) {
  return parseRoundId(roundId).systemIdFromName || DEFAULT_SYSTEM_ID;
}

export async function detectRoundInputs(roundId) {
  const roundRoot = getRoundRoot(roundId);
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

export async function detectBaselineInputs() {
  const imagePath = path.join(baselineRoot, BASELINE_FILES.image);
  const hasImage = await fileExists(imagePath);

  return {
    root: baselineRoot,
    imagePath,
    hasImage,
  };
}

export async function ensureSystemDefaultConfig(systemId) {
  const normalizedSystemId = String(systemId || DEFAULT_SYSTEM_ID).trim() || DEFAULT_SYSTEM_ID;
  const configFile = getSystemDefaultConfigFileName(normalizedSystemId);
  const configPath = path.join(baselineRoot, configFile);
  const hasConfig = await fileExists(configPath);
  if (!hasConfig) {
    throw new Error(
      `Missing system default config: source/baseline/${configFile}.`
    );
  }

  const config = JSON.parse(await readText(configPath));
  return {
    systemId: normalizedSystemId,
    rootDir: "source/baseline",
    configFile,
    configPath,
    hasConfig,
    config,
  };
}

function decorateRoundConfig(config, roundId, systemId) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    system_id: String(
      (config && typeof config === "object" ? config.system_id : "") || systemId || DEFAULT_SYSTEM_ID
    ).trim(),
    round_key: String(
      (config && typeof config === "object" ? config.round_key : "") ||
        buildRoundKey(systemId, roundId)
    ).trim(),
  };
}

export async function ensureRoundConfig(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const roundRoot = getRoundRoot(normalizedRoundId);
  const configPath = path.join(roundRoot, ROUND_CONFIG_FILE);
  const hasRoundConfig = await fileExists(configPath);
  const inferredSystemId = inferRoundSystemId(normalizedRoundId);

  if (!hasRoundConfig) {
    const systemDefault = await ensureSystemDefaultConfig(inferredSystemId);
    const initialConfig = decorateRoundConfig(
      systemDefault.config,
      normalizedRoundId,
      systemDefault.systemId
    );
    await writeJson(configPath, initialConfig);
  }

  const config = decorateRoundConfig(
    JSON.parse(await readText(configPath)),
    normalizedRoundId,
    inferredSystemId
  );
  await writeJson(configPath, config);

  return {
    roundId: normalizedRoundId,
    roundRoot,
    rootDir: `source/${normalizedRoundId}`,
    configFile: ROUND_CONFIG_FILE,
    configPath,
    systemId: config.system_id || inferredSystemId,
    roundKey: config.round_key || buildRoundKey(inferredSystemId, normalizedRoundId),
    config,
  };
}

export function normalizeBaselineRule(rule) {
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

export function matchesBaselineHarRule(entry, rule) {
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

export function buildBaselineConfigSummary(config) {
  if (!config) {
    return null;
  }

  return {
    systemId: String(config.system_id || "").trim() || null,
    roundKey: String(config.round_key || "").trim() || null,
    excludeUrlExprs: Array.isArray(config.exclude_url_exprs)
      ? config.exclude_url_exprs.map((expr) => String(expr)).filter(Boolean)
      : [],
    showLoginPage: normalizeBaselineRule(config.show_login_page),
    submitLoginPage: normalizeBaselineRule(config.submit_login_page),
  };
}

export function extractLocalizedTimestamp(rawText) {
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

export function parseLocalizedTimestampToMs(formattedTimestamp) {
  if (!formattedTimestamp) {
    return null;
  }

  const match = formattedTimestamp.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$/
  );
  if (!match?.groups) {
    return null;
  }

  const { year, month, day, hour, minute, second } = match.groups;

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

export function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function formatRelativeTimecode(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);
  const milliseconds = safeMs % 1_000;
  return `${String(hours).padStart(2, "0")}-${String(minutes).padStart(2, "0")}-${String(
    seconds
  ).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function findSliceByRelativeMs(slices, relativeMs) {
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

export function findSliceByAbsoluteMs(slices, absoluteMs) {
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

export function sanitizeViewerState(rawState, roundId, validSliceIds, validGroupIds) {
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

export function buildSliceAnchor(slice) {
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
