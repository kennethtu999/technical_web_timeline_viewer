import {
  buildRoundAssetUrl,
  CAPTURE_OFFSET_AFTER_RESPONSE_MS,
  CAPTURE_OFFSET_BEFORE_REQUEST_MS,
  HAR_DETAIL_TEXT_LIMIT,
  HAR_HEADER_LINE_LIMIT,
  HTML_CAPTURE_CONTENT_TYPE_PREFIX,
  JSF_KIND_COLORS,
  matchesBaselineHarRule,
  safePathname,
  findSliceByAbsoluteMs,
  formatRelativeTimecode,
} from "./shared.js";

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

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

export function enrichHarEvents(har) {
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

function matchesUrlExpr(url, expr) {
  const rawUrl = String(url || "");
  const rawExpr = String(expr || "").trim();
  if (!rawUrl || !rawExpr) {
    return false;
  }

  try {
    return new RegExp(rawExpr, "i").test(rawUrl);
  } catch {
    return rawUrl.includes(rawExpr);
  }
}

function matchesExcludedUrlExpr(url, exprList) {
  const normalizedExprList = Array.isArray(exprList) ? exprList : [];
  return normalizedExprList.some((expr) => matchesUrlExpr(url, expr));
}

function buildCaptureSpecsForEntry(entry, index, baseline) {
  const method = String(entry.request?.method || "").toUpperCase();
  const url = entry.request?.url || "";
  const pathname = safePathname(url);
  const requestStartedAtMs = new Date(entry.startedDateTime).getTime();
  const responseTimeMs = Number(entry.time);
  const matchesShowLoginRule = matchesBaselineHarRule(entry, baseline.config?.show_login_page);
  const matchesSubmitLoginRule = matchesBaselineHarRule(entry, baseline.config?.submit_login_page);
  const forceBaselineCapture = matchesShowLoginRule || matchesSubmitLoginRule;
  const isExcludedByUrlExpr = matchesExcludedUrlExpr(
    url,
    baseline.config?.exclude_url_exprs
  );

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

  if (isExcludedByUrlExpr && !forceBaselineCapture) {
    return {
      candidates: [],
      skipped: [
        {
          harEntryIndex: index + 1,
          method,
          url,
          reason: "excluded-by-url-expr",
          excludeUrlExprs: baseline.config?.exclude_url_exprs || [],
        },
      ],
    };
  }

  if (!hasHtmlCaptureContentType(entry) && !forceBaselineCapture) {
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

export function buildHarCaptureCandidates({ har, videoStartMs, videoDurationMs, baseline }) {
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

export function buildSlicesFromCaptureCandidates(
  candidates,
  roundId,
  videoDurationMs,
  baselineThumbnailName
) {
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
    const thumbnailSrc =
      candidate.isLoginAnchor && baselineThumbnailName
        ? buildRoundAssetUrl(roundId, ["viewer", "thumbnails", baselineThumbnailName])
        : buildRoundAssetUrl(roundId, ["viewer", "thumbnails", imageFile]);

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

function attachRecordingToSliceUnique(slice, event) {
  if (!slice || !event) {
    return;
  }

  if (slice.recordingEvents.some((existingEvent) => existingEvent.id === event.id)) {
    return;
  }

  slice.recordingEvents.push(event);
}

export function attachEventsToSlices(slices, harEvents, recordingEvents) {
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
    const targetSlice = sliceMap.get(event.targetSliceId);
    attachRecordingToSliceUnique(targetSlice, event);

    if (!targetSlice?.sourceEventId) {
      continue;
    }

    const siblingSlices = sourceSliceMap.get(targetSlice.sourceEventId) || [];
    for (const siblingSlice of siblingSlices) {
      attachRecordingToSliceUnique(siblingSlice, event);
    }
  }
}
