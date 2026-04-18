import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_FILES,
  buildBaselineConfigSummary,
  buildRoundKey,
  buildRoundAssetUrl,
  buildSliceAnchor,
  CANONICAL_INPUTS,
  CAPTURE_OFFSET_AFTER_RESPONSE_MS,
  CAPTURE_OFFSET_BEFORE_REQUEST_MS,
  CAPTURE_RULE_VERSION,
  createDefaultViewerState,
  DEFAULT_PREVIEW_END_SEC,
  DEFAULT_PREVIEW_START_SEC,
  detectBaselineInputs,
  detectRoundInputs,
  ensureRoundConfig,
  ensureDir,
  extractLocalizedTimestamp,
  fileExists,
  getRoundIds,
  getRoundPreviewRoot,
  getRoundViewerRoot,
  HTML_CAPTURE_CONTENT_TYPE_PREFIX,
  matchesBaselineHarRule,
  normalizeRoundId,
  parseLocalizedTimestampToMs,
  readJson,
  sanitizeViewerState,
  writeJson,
} from "./prepare/shared.js";
import {
  attachEventsToSlices,
  buildHarCaptureCandidates,
  buildSlicesFromCaptureCandidates,
  enrichHarEvents,
} from "./prepare/har.js";
import {
  enrichRecordingEvents,
  selectLoginAnchorSlice,
} from "./prepare/recording.js";
import {
  buildSamplingFrames,
  extractFrameByOffset,
  probeVideoDurationMs,
} from "./prepare/video.js";

const __filename = fileURLToPath(import.meta.url);

function normalizeConfiguredVideoMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return Math.round(numericValue);
}

function findSubmitLoginCandidates(har, baseline) {
  return (har?.log?.entries || [])
    .map((entry, index) => {
      const requestStartedAtMs = new Date(entry.startedDateTime).getTime();
      if (!Number.isFinite(requestStartedAtMs)) {
        return null;
      }

      if (!matchesBaselineHarRule(entry, baseline?.config?.submit_login_page)) {
        return null;
      }

      return {
        harEntryIndex: index + 1,
        requestStartedAtMs,
        visualPressAtMs: requestStartedAtMs - CAPTURE_OFFSET_BEFORE_REQUEST_MS,
        startedDateTime: entry.startedDateTime,
        url: entry.request?.url || "",
      };
    })
    .filter(Boolean);
}

export function resolveEffectiveVideoStart({
  har,
  baseline,
  inferredVideoStartMs,
}) {
  const submitVideoMs = normalizeConfiguredVideoMs(baseline?.config?.submit_login_page?.video_ms);

  if (submitVideoMs == null) {
    throw new Error(
      "Baseline config must provide submit_login_page.video_ms. This value should be the visual moment when the login button is pressed."
    );
  }

  if (!Number.isFinite(inferredVideoStartMs)) {
    throw new Error(
      "Unable to determine inferred video start from recording title or canonical file name."
    );
  }

  const submitCandidates = findSubmitLoginCandidates(har, baseline);
  if (!submitCandidates.length) {
    throw new Error(
      "No HAR request matched baseline submit_login_page rule, so video_ms cannot be used to anchor the video."
    );
  }

  const targetVisualPressAtMs = inferredVideoStartMs + submitVideoMs;
  const selectedSubmitCandidate = [...submitCandidates].sort((left, right) => {
    const leftDistance = Math.abs(left.visualPressAtMs - targetVisualPressAtMs);
    const rightDistance = Math.abs(right.visualPressAtMs - targetVisualPressAtMs);

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.visualPressAtMs - right.visualPressAtMs;
  })[0];

  const effectiveVideoStartMs = selectedSubmitCandidate.visualPressAtMs - submitVideoMs;

  return {
    effectiveVideoStartMs,
    effectiveVideoStartSource: "submit_login_page.video_ms",
    submitLoginVideoMs: submitVideoMs,
    matchedSubmitHarEntryIndex: selectedSubmitCandidate.harEntryIndex,
    matchedSubmitStartedAt: selectedSubmitCandidate.startedDateTime,
  };
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

async function runHarDrivenCaptures({
  roundId,
  har,
  videoStartMs,
  videoDurationMs,
  baseline,
  artifactRoot,
  viewerThumbnailsRoot,
}) {
  const artifactThumbnailsRoot = path.join(artifactRoot, "thumbnails");
  await ensureDir(artifactRoot);
  await fs.rm(artifactThumbnailsRoot, { recursive: true, force: true });
  await fs.rm(viewerThumbnailsRoot, { recursive: true, force: true });
  await ensureDir(artifactThumbnailsRoot);
  await ensureDir(viewerThumbnailsRoot);

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
    skipped,
    baselineThumbnailName,
    artifactThumbnailsRoot,
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
      loginAnchorSlice.thumbnailSrc = buildRoundAssetUrl(roundId, [
        "viewer",
        "thumbnails",
        baselineThumbnailName,
      ]);
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
      configFile: baseline.configFile || null,
      imageFile: baseline.hasImage ? BASELINE_FILES.image : null,
      config: buildBaselineConfigSummary(baseline.config),
      loginAnchorSliceId: loginAnchorSlice?.id ?? null,
      loginSubmitSliceId: loginSubmitSlice?.id ?? null,
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
      loginAnchor:
        baseline.hasConfig || baseline.hasImage
          ? {
              imageSourceDir: baseline.hasImage ? "source/baseline" : null,
              configSourceDir: `source/${roundId}`,
              imageFile: baseline.hasImage ? BASELINE_FILES.image : null,
              configFile: baseline.configFile || null,
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

function normalizePreviewLimit(limit, fallbackValue = 10) {
  const numericLimit = Number(limit);
  if (!Number.isInteger(numericLimit) || numericLimit <= 0) {
    return fallbackValue;
  }
  return numericLimit;
}

async function resolveRoundPrepareInputs(roundId, options = {}) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const inputPaths = await detectRoundInputs(normalizedRoundId);
  const [baselineAssets, roundConfig] = await Promise.all([
    detectBaselineInputs(),
    ensureRoundConfig(normalizedRoundId),
  ]);
  const [recording, har] = await Promise.all([
    readJson(inputPaths.recording),
    readJson(inputPaths.har),
  ]);

  const videoStart =
    extractLocalizedTimestamp(recording?.title) ||
    extractLocalizedTimestamp(path.basename(inputPaths.video)) ||
    extractLocalizedTimestamp(path.basename(inputPaths.recording));
  const videoStartMs = parseLocalizedTimestampToMs(videoStart);

  if (!videoStart || !Number.isFinite(videoStartMs)) {
    throw new Error(
      `Unable to determine video_start for ${normalizedRoundId}. HAR-driven capture requires a localized timestamp in recording title or canonical file names.`
    );
  }

  let videoDurationMs = Number(options.videoDurationMs);
  if (!Number.isFinite(videoDurationMs) || videoDurationMs <= 0) {
    const roundMetaPath = path.join(getRoundViewerRoot(normalizedRoundId), "round-meta.json");
    if (await fileExists(roundMetaPath)) {
      const roundMeta = await readJson(roundMetaPath);
      videoDurationMs = Number(roundMeta.durationMs);
    }
  }

  if (!Number.isFinite(videoDurationMs) || videoDurationMs <= 0) {
    videoDurationMs = probeVideoDurationMs(inputPaths.video);
  }

  const baseline = {
    ...baselineAssets,
    hasConfig: true,
    configFile: roundConfig.configFile,
    configPath: roundConfig.configPath,
    config: roundConfig.config,
    systemId: roundConfig.systemId,
    roundKey: roundConfig.roundKey,
  };

  const {
    effectiveVideoStartMs,
    effectiveVideoStartSource,
    submitLoginVideoMs,
    matchedSubmitHarEntryIndex,
    matchedSubmitStartedAt,
  } = resolveEffectiveVideoStart({
    har,
    baseline,
    inferredVideoStartMs: videoStartMs,
  });

  return {
    roundId: normalizedRoundId,
    inputPaths,
    baseline,
    recording,
    har,
    videoStart,
    videoStartMs,
    effectiveVideoStartMs,
    effectiveVideoStartSource,
    submitLoginVideoMs,
    matchedSubmitHarEntryIndex,
    matchedSubmitStartedAt,
    videoDurationMs,
  };
}

export function buildHarProcessingPreview({
  roundId,
  har,
  recording,
  baseline,
  videoStartMs,
  videoDurationMs,
  limit = 10,
}) {
  const normalizedLimit = normalizePreviewLimit(limit, 10);
  const baselineContext = {
    ...baseline,
    har,
  };
  const { candidates, skipped } = buildHarCaptureCandidates({
    har,
    videoStartMs,
    videoDurationMs,
    baseline: baselineContext,
  });
  const slices = buildSlicesFromCaptureCandidates(
    candidates,
    roundId,
    videoDurationMs,
    baseline.hasImage ? "login-anchor.jpg" : null
  );
  const recordingEvents = enrichRecordingEvents(recording, slices, videoDurationMs);
  const harEvents = enrichHarEvents(har);
  attachEventsToSlices(slices, harEvents, recordingEvents);

  return {
    roundId,
    totalCaptureCount: slices.length,
    skippedCount: skipped.length,
    items: slices.slice(0, normalizedLimit).map((slice, index) => ({
      order: index + 1,
      harEntryIndex: slice.harEntryIndex,
      method: slice.method,
      pathname: slice.pathname,
      url: slice.url,
      captureKind: slice.captureKind,
      captureSec: Number((slice.startMs / 1000).toFixed(3)),
      captureOffsetMs: slice.startMs,
      recordingLabels: slice.recordingEvents.map((event) => event.label),
    })),
  };
}

export async function inspectRoundHarProcessing(roundId, options = {}) {
  const context = await resolveRoundPrepareInputs(roundId, options);
  return {
    roundId: context.roundId,
    videoStart: context.videoStart,
    videoStartMs: context.videoStartMs,
    effectiveVideoStartMs: context.effectiveVideoStartMs,
    videoDurationMs: context.videoDurationMs,
    ...buildHarProcessingPreview({
      roundId: context.roundId,
      har: context.har,
      recording: context.recording,
      baseline: context.baseline,
      videoStartMs: context.effectiveVideoStartMs,
      videoDurationMs: context.videoDurationMs,
      limit: options.limit,
    }),
  };
}

export async function listPreparedRounds() {
  const roundIds = await getRoundIds();
  const rounds = [];

  for (const roundId of roundIds) {
    const metaPath = path.join(getRoundViewerRoot(roundId), "round-meta.json");
    if (await fileExists(metaPath)) {
      rounds.push(await readJson(metaPath));
    }
  }

  return rounds;
}

export async function prepareRound(roundId) {
  const {
    roundId: normalizedRoundId,
    inputPaths,
    baseline,
    recording,
    har,
    videoStart,
    videoStartMs,
    effectiveVideoStartMs,
    effectiveVideoStartSource,
    submitLoginVideoMs,
    matchedSubmitHarEntryIndex,
    matchedSubmitStartedAt,
    videoDurationMs,
  } = await resolveRoundPrepareInputs(roundId);
  const roundRoot = inputPaths.roundRoot;
  const viewerRoot = path.join(roundRoot, "viewer");
  const viewerTimelinePath = path.join(viewerRoot, "timeline.json");
  const viewerStatePath = path.join(viewerRoot, "viewer-state.json");
  const viewerMetaPath = path.join(viewerRoot, "round-meta.json");
  const viewerThumbnailsRoot = path.join(viewerRoot, "thumbnails");
  const artifactRoot = path.join(roundRoot, "artifacts", "har-captures");
  const baselineContext = {
    ...baseline,
    har,
  };

  await ensureDir(artifactRoot);

  const {
    slices,
    skipped,
    baselineThumbnailName,
    artifactThumbnailsRoot,
  } = await runHarDrivenCaptures({
    roundId: normalizedRoundId,
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
  } = selectLoginAnchorSlice({
    slices,
    baseline: baselineContext,
  });
  const { captureReport } = await finalizeHarDrivenCaptures({
    roundId: normalizedRoundId,
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
  });

  const harEvents = enrichHarEvents(har);
  attachEventsToSlices(slices, harEvents, recordingEvents);
  const { groups, loginAnchorSlice: groupedLoginAnchorSlice } = buildInitialGroups(slices);

  const validSliceIds = new Set(slices.map((slice) => slice.id));
  const validGroupIds = new Set(groups.map((group) => group.id));
  const existingViewerState = (await fileExists(viewerStatePath))
    ? await readJson(viewerStatePath)
    : createDefaultViewerState(normalizedRoundId);
  let viewerState = sanitizeViewerState(
    existingViewerState,
    normalizedRoundId,
    validSliceIds,
    validGroupIds
  );

  if (!viewerState.startAnchor && groupedLoginAnchorSlice) {
    viewerState = {
      ...viewerState,
      startAnchor: buildSliceAnchor(groupedLoginAnchorSlice),
    };
  }

  const timeline = {
    meta: {
      title: `${normalizedRoundId}`,
      sourceRound: normalizedRoundId,
      videoName: path.basename(inputPaths.video),
      sliceCount: slices.length,
      requestEventCount: harEvents.length,
      recordingEventCount: recordingEvents.length,
      durationMs: videoDurationMs,
      rawSceneCount: null,
      skippedOverlapCount: null,
      overlapRule: null,
      generatedAt: new Date().toISOString(),
      requestKinds: ["document-get", "document-post", "ajax"],
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
    roundId: normalizedRoundId,
    inputPaths,
    timeline,
    viewerState,
    baseline: baselineContext,
    videoStart: {
      inferred: videoStart,
      inferredIso: new Date(videoStartMs).toISOString(),
      source: effectiveVideoStartSource,
      submitLoginVideoMs,
      matchedSubmitHarEntryIndex,
      matchedSubmitStartedAt,
      effective: new Date(effectiveVideoStartMs).toISOString(),
    },
    captureReport,
  });

  await writeJson(viewerTimelinePath, timeline);
  await writeJson(viewerStatePath, viewerState);
  await writeJson(viewerMetaPath, roundMeta);

  console.log(
    `Prepared ${normalizedRoundId}: ${timeline.meta.sliceCount} slices / ${timeline.meta.requestEventCount} HAR / ${timeline.meta.recordingEventCount} recording`
  );

  return roundMeta;
}

export async function readRoundTimeline(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  return readJson(path.join(getRoundViewerRoot(normalizedRoundId), "timeline.json"));
}

export async function readRoundMeta(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  return readJson(path.join(getRoundViewerRoot(normalizedRoundId), "round-meta.json"));
}

export async function readRoundViewerState(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const statePath = path.join(getRoundViewerRoot(normalizedRoundId), "viewer-state.json");
  if (!(await fileExists(statePath))) {
    return createDefaultViewerState(normalizedRoundId);
  }
  return readJson(statePath);
}

export async function writeRoundViewerState(roundId, nextState) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const timeline = await readRoundTimeline(normalizedRoundId);
  const validSliceIds = new Set((timeline.slices || []).map((slice) => slice.id));
  const validGroupIds = new Set((timeline.groups || []).map((group) => group.id));
  const statePath = path.join(getRoundViewerRoot(normalizedRoundId), "viewer-state.json");
  const sanitizedState = sanitizeViewerState(
    {
      ...createDefaultViewerState(normalizedRoundId),
      ...nextState,
      roundId: normalizedRoundId,
      updatedAt: new Date().toISOString(),
    },
    normalizedRoundId,
    validSliceIds,
    validGroupIds
  );
  await writeJson(statePath, sanitizedState);
  return sanitizedState;
}

export async function readRoundConfig(roundId) {
  const roundConfig = await ensureRoundConfig(roundId);
  return {
    roundId: roundConfig.roundId,
    rootDir: roundConfig.rootDir,
    configFile: roundConfig.configFile,
    systemId: roundConfig.systemId,
    roundKey: roundConfig.roundKey,
    config: roundConfig.config || {},
    rawText: JSON.stringify(roundConfig.config || {}, null, 2),
    defaults: {
      previewStartSec: DEFAULT_PREVIEW_START_SEC,
      previewEndSec: DEFAULT_PREVIEW_END_SEC,
    },
  };
}

export async function writeRoundConfig(roundId, rawText) {
  const roundConfig = await ensureRoundConfig(roundId);
  const parsedConfig = JSON.parse(String(rawText || "{}"));
  const normalizedConfig = {
    ...parsedConfig,
    system_id: String(parsedConfig.system_id || roundConfig.systemId || "").trim() || roundConfig.systemId,
    round_key:
      String(parsedConfig.round_key || "").trim() ||
      buildRoundKey(roundConfig.systemId, roundConfig.roundId),
  };

  await writeJson(roundConfig.configPath, normalizedConfig);

  return {
    roundId: roundConfig.roundId,
    rootDir: roundConfig.rootDir,
    configFile: roundConfig.configFile,
    systemId: normalizedConfig.system_id,
    roundKey: normalizedConfig.round_key,
    config: normalizedConfig,
    rawText: JSON.stringify(normalizedConfig, null, 2),
    defaults: {
      previewStartSec: DEFAULT_PREVIEW_START_SEC,
      previewEndSec: DEFAULT_PREVIEW_END_SEC,
    },
  };
}

function normalizePreviewSecond(value, fallbackValue) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallbackValue;
  }
  return numericValue;
}

function normalizePreviewWindow(startSec, endSec) {
  const normalizedStartSec = normalizePreviewSecond(startSec, DEFAULT_PREVIEW_START_SEC);
  const normalizedEndSec = normalizePreviewSecond(endSec, DEFAULT_PREVIEW_END_SEC);
  if (normalizedEndSec < normalizedStartSec) {
    return {
      startSec: normalizedStartSec,
      endSec: normalizedStartSec,
    };
  }
  return {
    startSec: normalizedStartSec,
    endSec: normalizedEndSec,
  };
}

function normalizePreviewCapturePoints(capturePointsSec, startSec, endSec) {
  const rawPoints = Array.isArray(capturePointsSec) ? capturePointsSec : [];
  const normalizedPoints = Array.from(
    new Set(
      rawPoints
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= startSec && value <= endSec)
        .sort((left, right) => left - right)
    )
  );

  if (normalizedPoints.length) {
    return normalizedPoints;
  }

  return [startSec, endSec].filter((value, index, array) => array.indexOf(value) === index);
}

function formatPreviewActualSecondToken(resolvedCaptureSec) {
  const totalMs = Math.round(Number(resolvedCaptureSec || 0) * 1000);
  const sec = Math.floor(totalMs / 1000);
  const ms = Math.abs(totalMs % 1000);
  return `${sec}_${String(ms).padStart(3, "0")}`;
}

export async function runPreviewCapture({
  roundId,
  startSec = DEFAULT_PREVIEW_START_SEC,
  endSec = DEFAULT_PREVIEW_END_SEC,
  capturePointsSec = [],
}) {
  const normalizedRoundId = normalizeRoundId(roundId);
  const inputPaths = await detectRoundInputs(normalizedRoundId);
  const baselineAssets = await detectBaselineInputs();
  const roundConfig = await ensureRoundConfig(normalizedRoundId);
  const previewWindow = normalizePreviewWindow(startSec, endSec);
  const previewPoints = normalizePreviewCapturePoints(
    capturePointsSec,
    previewWindow.startSec,
    previewWindow.endSec
  );
  const previewJobId = `preview-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const previewRoot = path.join(getRoundPreviewRoot(normalizedRoundId), previewJobId);
  const videoDurationMs = probeVideoDurationMs(inputPaths.video);

  await fs.rm(previewRoot, { recursive: true, force: true });
  await ensureDir(previewRoot);

  const images = [];
  for (const [index, captureSec] of previewPoints.entries()) {
    const resolvedCaptureSec = captureSec;
    if (resolvedCaptureSec < 0 || resolvedCaptureSec * 1000 > videoDurationMs) {
      continue;
    }

    const fileName =
      `frame-${String(index + 1).padStart(3, "0")}` +
      `__actual-${formatPreviewActualSecondToken(resolvedCaptureSec)}.jpg`;
    const outputPath = path.join(previewRoot, fileName);
    extractFrameByOffset(inputPaths.video, resolvedCaptureSec, outputPath);
    images.push({
      id: `${previewJobId}-${index + 1}`,
      label: `${captureSec}s -> ${resolvedCaptureSec.toFixed(3)}s`,
      captureSec,
      resolvedCaptureSec,
      offsetMs: Math.round(resolvedCaptureSec * 1000),
      imageFile: fileName,
      assetUrl: buildRoundAssetUrl(normalizedRoundId, ["preview", previewJobId, fileName]),
    });
  }

  const previewReport = {
    roundId: normalizedRoundId,
    previewJobId,
    generatedAt: new Date().toISOString(),
    startSec: previewWindow.startSec,
    endSec: previewWindow.endSec,
    capturePointsSec: previewPoints,
    imageCount: images.length,
    roundConfig: {
      configFile: roundConfig.configFile,
      systemId: roundConfig.systemId,
      roundKey: roundConfig.roundKey,
      config: roundConfig.config,
    },
    baselineImage: {
      imageFile: baselineAssets.hasImage ? BASELINE_FILES.image : null,
    },
  };

  await writeJson(path.join(previewRoot, "preview.json"), previewReport);

  return {
    ...previewReport,
    images,
  };
}

export async function applyRoundWithBaseline({ roundId }) {
  const normalizedRoundId = normalizeRoundId(roundId);
  return prepareRound(normalizedRoundId);
}

export async function runPrepareCli(explicitRounds = process.argv.slice(2).filter(Boolean)) {
  const roundIds = explicitRounds.length
    ? explicitRounds.map((roundId) => normalizeRoundId(roundId))
    : await getRoundIds();

  if (!roundIds.length) {
    throw new Error("No round directories found under source/.");
  }

  const roundSummaries = [];
  for (const roundId of roundIds) {
    roundSummaries.push(await prepareRound(roundId));
  }

  return roundSummaries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runPrepareCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
