import {
  CAPTURE_OFFSET_BEFORE_REQUEST_MS,
  findSliceByAbsoluteMs,
  findSliceByRelativeMs,
  matchesBaselineHarRule,
} from "./shared.js";

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

export function enrichRecordingEvents(recording, slices, durationMs) {
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

function buildBaselineSubmitEntries(slices, baseline) {
  return (baseline.har?.log?.entries || [])
    .map((entry, index) => {
      if (!matchesBaselineHarRule(entry, baseline.config?.submit_login_page)) {
        return null;
      }

      const absoluteMs = new Date(entry.startedDateTime).getTime();
      if (!Number.isFinite(absoluteMs)) {
        return null;
      }

      const visualPressMs = absoluteMs - CAPTURE_OFFSET_BEFORE_REQUEST_MS;

      return {
        id: `har-${index + 1}`,
        harEntryIndex: index + 1,
        method: entry.request?.method || "",
        url: entry.request?.url || "",
        absoluteMs,
        visualPressMs,
        targetSliceId: findSliceByAbsoluteMs(slices, visualPressMs)?.id ?? null,
      };
    })
    .filter(Boolean);
}

export function selectLoginAnchorSlice({ slices, baseline }) {
  const showSlices = slices.filter(
    (slice) => slice.matchesShowLoginRule && slice.method === "GET" && slice.captureKind === "get-after"
  );
  if (!showSlices.length) {
    return {
      loginAnchorSlice: null,
      loginSubmitEntry: null,
    };
  }

  const submitEntries = buildBaselineSubmitEntries(slices, baseline);
  const configuredVideoMs = Number(baseline.config?.submit_login_page?.video_ms);
  const selectedSubmitEntry = submitEntries.length
    ? [...submitEntries].sort((left, right) => {
        const leftSlice = left.targetSliceId ? slices.find((slice) => slice.id === left.targetSliceId) : null;
        const rightSlice = right.targetSliceId ? slices.find((slice) => slice.id === right.targetSliceId) : null;
        const leftDistance =
          Number.isFinite(configuredVideoMs) && leftSlice
            ? Math.abs(Number(leftSlice.startMs || 0) - configuredVideoMs)
            : Number.POSITIVE_INFINITY;
        const rightDistance =
          Number.isFinite(configuredVideoMs) && rightSlice
            ? Math.abs(Number(rightSlice.startMs || 0) - configuredVideoMs)
            : Number.POSITIVE_INFINITY;

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        return left.visualPressMs - right.visualPressMs;
      })[0]
    : null;

  const loginAnchorSlice = selectedSubmitEntry
    ? showSlices.filter((slice) => new Date(slice.absoluteTimestamp).getTime() <= selectedSubmitEntry.visualPressMs).at(-1) ||
      showSlices[0]
    : showSlices[0];

  return {
    loginAnchorSlice,
    loginSubmitEntry: selectedSubmitEntry,
  };
}
