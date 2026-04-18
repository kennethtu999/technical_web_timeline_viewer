import { computed, ref, watch } from "vue";

const DEFAULT_REQUEST_KINDS = ["document-get", "document-post", "ajax"];
const ALL_GROUPS_VALUE = "__all__";
const DEFAULT_ZOOM = 0.05;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 0.18;
const SAVE_DEBOUNCE_MS = 450;
const GROUP_COLORS = ["#355c7d", "#c95f34", "#3a7a6d", "#6b8f2a", "#8f4d76"];
const THUMBNAIL_SLICE_WIDTH_PX = 144;
const DEFAULT_PREVIEW_START_SEC = 0;
const DEFAULT_PREVIEW_END_SEC = 60;
const PREVIEW_SLICE_MATCH_THRESHOLD_SEC = 1;
const DEFAULT_RECORDING_GROUP_MODE = "default";
const RECORDING_GROUP_SHIFT_PX = 56;

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

function createAnchorTarget(sourceType, item, slice) {
  if (!slice) {
    return null;
  }

  if (sourceType === "slice") {
    return {
      sliceId: slice.id,
      sourceType,
      itemId: slice.id,
      label: `${slice.relativeTimecode} · #${slice.sceneIndex}`,
    };
  }

  if (sourceType === "request") {
    return {
      sliceId: slice.id,
      sourceType,
      itemId: item.id,
      label: `${item.method} ${item.pathname}`,
    };
  }

  return {
    sliceId: slice.id,
    sourceType,
    itemId: item.id,
    label: `step ${item.stepIndex} · ${item.label}`,
  };
}

function rotateSlices(slices, anchorSliceId) {
  if (!anchorSliceId) {
    return slices;
  }

  const anchorIndex = slices.findIndex((slice) => slice.id === anchorSliceId);
  if (anchorIndex <= 0) {
    return slices;
  }

  return [...slices.slice(anchorIndex), ...slices.slice(0, anchorIndex)];
}

function parseJson(text) {
  return JSON.parse(text);
}

async function fetchJson(apiUrl, options) {
  const response = await fetch(apiUrl, options);
  if (!response.ok) {
    throw new Error(`Unable to load ${apiUrl} (${response.status})`);
  }
  return parseJson(await response.text());
}

function buildRegexFromPattern(rawPattern) {
  const trimmedPattern = String(rawPattern || "").trim();
  if (!trimmedPattern) {
    return null;
  }

  const isNegated = trimmedPattern.startsWith("!");
  const pattern = isNegated ? trimmedPattern.slice(1).trim() : trimmedPattern;
  if (!pattern) {
    return null;
  }

  const slashWrappedMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
  if (slashWrappedMatch) {
    const [, source, rawFlags] = slashWrappedMatch;
    const normalizedFlags = rawFlags.replace(/[gy]/g, "");
    return {
      regex: new RegExp(source, normalizedFlags),
      isNegated,
    };
  }

  return {
    regex: new RegExp(pattern),
    isNegated,
  };
}

function normalizeSelectedGroupIds(nextIds, availableGroups) {
  const validGroupIds = new Set(availableGroups.map((group) => group.id));
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

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function buildDefaultPreviewPointText(slices, startSec, endSec) {
  const normalizedPoints = Array.from(
    new Set(
      (Array.isArray(slices) ? slices : [])
        .map((slice) => Number((Number(slice.startMs || 0) / 1000).toFixed(3)))
        .filter((value) => Number.isFinite(value) && value >= startSec && value <= endSec)
    )
  ).sort((left, right) => left - right);

  const selectedPoints = normalizedPoints.slice(0, 12);
  if (!selectedPoints.length) {
    return `${startSec}, ${endSec}`;
  }

  return selectedPoints.join(", ");
}

function parseCapturePointsText(rawText) {
  return Array.from(
    new Set(
      String(rawText || "")
        .split(/[\s,]+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((left, right) => left - right)
    )
  );
}

function normalizeRecordingGroupMode(rawMode) {
  const allowedModes = new Set([
    DEFAULT_RECORDING_GROUP_MODE,
    "hide",
    "shift-left",
    "shift-right",
  ]);
  return allowedModes.has(rawMode) ? rawMode : DEFAULT_RECORDING_GROUP_MODE;
}

function recordingGroupStepLabel(events) {
  if (!events.length) {
    return "無步驟";
  }

  const firstStep = events[0].stepIndex;
  const lastStep = events.at(-1)?.stepIndex ?? firstStep;
  return firstStep === lastStep ? `step ${firstStep}` : `step ${firstStep}-${lastStep}`;
}

function buildRecordingGroups(slices, recordingGroupStates) {
  const visibleSlices = Array.isArray(slices) ? slices : [];
  const stateMap = recordingGroupStates || {};
  const groups = [];
  let currentGroup = null;

  for (const slice of visibleSlices) {
    const events = Array.isArray(slice.recordingEvents) ? slice.recordingEvents : [];
    if (!events.length) {
      currentGroup = null;
      continue;
    }

    const signature = events.map((event) => event.id).join("|");
    if (currentGroup && currentGroup.signature === signature) {
      currentGroup.sliceIds.push(slice.id);
      currentGroup.endSliceId = slice.id;
      currentGroup.lastDisplayLeftPx = slice.displayLeftPx;
      currentGroup.lastDisplayWidthPx = slice.displayWidthPx;
      continue;
    }

    currentGroup = {
      id: `recording-group:${events[0].id}:${events.at(-1)?.id ?? events[0].id}`,
      signature,
      sliceIds: [slice.id],
      startSliceId: slice.id,
      endSliceId: slice.id,
      firstDisplayLeftPx: slice.displayLeftPx,
      lastDisplayLeftPx: slice.displayLeftPx,
      lastDisplayWidthPx: slice.displayWidthPx,
      events,
    };
    groups.push(currentGroup);
  }

  return groups.map((group, index) => {
    const mode = normalizeRecordingGroupMode(stateMap[group.id]?.mode);
    const shiftPx =
      mode === "shift-left"
        ? -RECORDING_GROUP_SHIFT_PX
        : mode === "shift-right"
          ? RECORDING_GROUP_SHIFT_PX
          : 0;

    return {
      id: group.id,
      orderIndex: index,
      sliceIds: group.sliceIds,
      startSliceId: group.startSliceId,
      endSliceId: group.endSliceId,
      label: recordingGroupStepLabel(group.events),
      summary: `${group.events.length} 筆 recording`,
      events: group.events,
      mode,
      leftPx: group.firstDisplayLeftPx,
      widthPx:
        group.lastDisplayLeftPx + group.lastDisplayWidthPx - group.firstDisplayLeftPx,
      shiftPx,
    };
  });
}

function buildPreviewThumbnailOverrideMap(slices, previewResult) {
  const sourceSlices = Array.isArray(slices) ? slices : [];
  const previewImages = previewResult?.images || [];
  const overrides = {};

  for (const image of previewImages) {
    const requestedCaptureSec = Number(image.captureSec);
    if (!Number.isFinite(requestedCaptureSec)) {
      continue;
    }

    let bestSlice = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const slice of sourceSlices) {
      const sliceSec = Number(slice.startMs || 0) / 1000;
      const delta = Math.abs(sliceSec - requestedCaptureSec);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestSlice = slice;
      }
    }

    if (!bestSlice || bestDelta > PREVIEW_SLICE_MATCH_THRESHOLD_SEC) {
      continue;
    }

    overrides[bestSlice.id] = {
      assetUrl: image.assetUrl,
      label: image.label,
      imageFile: image.imageFile,
    };
  }

  return overrides;
}

export function useTimelineModel() {
  const rounds = ref([]);
  const rawTimeline = ref(null);
  const isLoading = ref(false);
  const error = ref("");
  const selectedRoundId = ref("");
  const selectedSliceId = ref(null);
  const viewerState = ref(createDefaultViewerState(""));
  const localGroups = ref([]);
  const apiWritable = ref(false);
  const saveStatus = ref("idle");
  const saveError = ref("");
  const interactionMode = ref("inspect");
  const hideEditMode = ref(false);
  const draftStartTarget = ref(null);
  const draftEndTarget = ref(null);
  const activeRequestDetail = ref(null);
  const baselineConfig = ref(null);
  const baselinePreviewStartSec = ref(DEFAULT_PREVIEW_START_SEC);
  const baselinePreviewEndSec = ref(DEFAULT_PREVIEW_END_SEC);
  const baselineCapturePointsText = ref("");
  const baselinePreviewResult = ref(null);
  const baselinePreviewSliceOverrides = ref({});
  const baselineStatus = ref("idle");
  const baselineError = ref("");
  const baselineBusy = ref(false);

  let saveTimer = null;
  let suppressAutoSave = false;

  function applyViewerState(nextState) {
    suppressAutoSave = true;
    viewerState.value = nextState;
    queueMicrotask(() => {
      suppressAutoSave = false;
    });
  }

  async function loadBaselineConfig() {
    const payload = await fetchJson("/api/baseline/page-login");
    baselineConfig.value = payload;
    return payload;
  }

  function resetBaselinePreviewForm() {
    baselinePreviewStartSec.value = DEFAULT_PREVIEW_START_SEC;
    baselinePreviewEndSec.value = DEFAULT_PREVIEW_END_SEC;
    baselineCapturePointsText.value = buildDefaultPreviewPointText(
      rawTimeline.value?.slices || [],
      DEFAULT_PREVIEW_START_SEC,
      DEFAULT_PREVIEW_END_SEC
    );
    baselinePreviewResult.value = null;
    baselinePreviewSliceOverrides.value = {};
    baselineStatus.value = "idle";
    baselineError.value = "";
  }

  async function loadRoundIndex() {
    const data = await fetchJson("/api/round-index");

    rounds.value = data.rounds || [];
    apiWritable.value = Boolean(data.writable ?? true);

    if (!rounds.value.length) {
      throw new Error("No prepared rounds found. Run timeline:prepare first.");
    }

    if (!selectedRoundId.value || !rounds.value.some((round) => round.id === selectedRoundId.value)) {
      selectedRoundId.value = rounds.value[0].id;
    }
  }

  async function loadTimeline(roundId = selectedRoundId.value) {
    if (!roundId) {
      return;
    }

    clearTimeout(saveTimer);
    isLoading.value = true;
    error.value = "";
    saveError.value = "";

    try {
      const [timelineData, stateData] = await Promise.all([
        fetchJson(`/api/rounds/${roundId}/timeline`),
        fetchJson(`/api/rounds/${roundId}/state`).catch(() => createDefaultViewerState(roundId)),
      ]);

      rawTimeline.value = timelineData;
      localGroups.value = [];
      applyViewerState({
        ...createDefaultViewerState(roundId),
        ...stateData,
        zoom: clampZoom(stateData?.zoom),
        selectedGroupIds: normalizeSelectedGroupIds(
          stateData?.selectedGroupIds,
          timelineData?.groups || []
        ),
        requestKindFilter: normalizeRequestKindFilter(stateData?.requestKindFilter),
        requestUrlPattern: String(stateData?.requestUrlPattern || ""),
        roundId,
      });
      selectedSliceId.value = rawTimeline.value?.slices?.[0]?.id ?? null;
      draftStartTarget.value = null;
      draftEndTarget.value = null;
      activeRequestDetail.value = null;
      interactionMode.value = "inspect";
      hideEditMode.value = false;
      saveStatus.value = "idle";
      await loadBaselineConfig();
      resetBaselinePreviewForm();
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : String(loadError);
      rawTimeline.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadInitialData() {
    isLoading.value = true;
    error.value = "";

    try {
      await Promise.all([loadRoundIndex(), loadBaselineConfig()]);
      await loadTimeline(selectedRoundId.value);
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : String(loadError);
      rawTimeline.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveViewerState() {
    if (!apiWritable.value || !selectedRoundId.value) {
      return;
    }

    try {
      saveStatus.value = "saving";
      saveError.value = "";
      const response = await fetch(`/api/rounds/${selectedRoundId.value}/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(viewerState.value),
      });

      if (!response.ok) {
        throw new Error(`Unable to save viewer state (${response.status})`);
      }

      const payload = await response.json();
      suppressAutoSave = true;
      viewerState.value = {
        ...viewerState.value,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      };
      queueMicrotask(() => {
        suppressAutoSave = false;
      });
      saveStatus.value = "saved";
    } catch (saveStateError) {
      saveStatus.value = "error";
      saveError.value =
        saveStateError instanceof Error ? saveStateError.message : String(saveStateError);
    }
  }

  function queueSaveViewerState() {
    if (!apiWritable.value || suppressAutoSave) {
      return;
    }

    clearTimeout(saveTimer);
    saveStatus.value = "saving";
    saveTimer = setTimeout(() => {
      saveViewerState();
    }, SAVE_DEBOUNCE_MS);
  }

  watch(
    viewerState,
    () => {
      queueSaveViewerState();
    },
    { deep: true }
  );

  const hiddenSliceIdSet = computed(() => new Set(viewerState.value.hiddenSliceIds || []));
  const mergedGroups = computed(() => {
    const sourceGroups = rawTimeline.value?.groups || [];
    return [...sourceGroups, ...localGroups.value];
  });

  const groupFilterOptions = computed(() => [
    {
      label: "全部",
      value: ALL_GROUPS_VALUE,
    },
    ...mergedGroups.value.map((group) => ({
      label: group.label,
      value: group.id,
    })),
  ]);

  const selectedGroupIds = computed(() =>
    normalizeSelectedGroupIds(viewerState.value.selectedGroupIds, mergedGroups.value)
  );

  const normalizedSelectedGroupIds = computed(() =>
    normalizeSelectedGroupIds(viewerState.value.selectedGroupIds, mergedGroups.value)
  );

  const requestKindFilter = computed(() =>
    normalizeRequestKindFilter(viewerState.value.requestKindFilter)
  );

  const requestUrlPattern = computed(() => String(viewerState.value.requestUrlPattern || ""));

  const zoom = computed(() => clampZoom(viewerState.value.zoom));

  const filteredGroups = computed(() => {
    if (normalizedSelectedGroupIds.value.includes(ALL_GROUPS_VALUE)) {
      return mergedGroups.value;
    }

    const selectedGroupIdSet = new Set(normalizedSelectedGroupIds.value);
    return mergedGroups.value.filter((group) => selectedGroupIdSet.has(group.id));
  });

  const requestUrlRegexState = computed(() => {
    const pattern = String(viewerState.value.requestUrlPattern || "").trim();
    if (!pattern) {
      return {
        regex: null,
        error: "",
      };
    }

    try {
      return {
        regex: buildRegexFromPattern(pattern),
        error: "",
      };
    } catch (regexError) {
      return {
        regex: null,
        error: regexError instanceof Error ? regexError.message : String(regexError),
      };
    }
  });

  watch(
    mergedGroups,
    (nextGroups) => {
      const normalized = normalizeSelectedGroupIds(viewerState.value.selectedGroupIds, nextGroups);
      if (arraysEqual(normalized, viewerState.value.selectedGroupIds || [])) {
        return;
      }

      viewerState.value = {
        ...viewerState.value,
        selectedGroupIds: normalized,
      };
    },
    { immediate: true }
  );

  const visibleSlices = computed(() => {
    if (!rawTimeline.value) {
      return [];
    }

    const allGroups = mergedGroups.value;
    const selectedGroupIdSet = new Set(
      normalizedSelectedGroupIds.value.filter((groupId) => groupId !== ALL_GROUPS_VALUE)
    );
    const showAllGroups = selectedGroupIdSet.size === 0;
    const requestUrlMatcher = requestUrlRegexState.value.regex;
    const baseSlices = rawTimeline.value.slices.map((slice) => {
      const offsetMs = Number(viewerState.value.offsets?.[slice.id] ?? slice.baseOffsetMs ?? 0);
      const previewOverride = baselinePreviewSliceOverrides.value[slice.id] || null;
      return {
        ...slice,
        offsetMs,
        thumbnailSrc: previewOverride?.assetUrl || slice.thumbnailSrc,
        previewOverrideLabel: previewOverride?.label || "",
        displayImageFileName: previewOverride?.imageFile || slice.imageFile || "",
        isHidden: hiddenSliceIdSet.value.has(slice.id),
        requestEvents: slice.requestEvents.filter((event) => {
          if (!normalizeRequestKindFilter(viewerState.value.requestKindFilter).includes(event.kind)) {
            return false;
          }

          if (!requestUrlMatcher) {
            return true;
          }

          requestUrlMatcher.regex.lastIndex = 0;
          const isMatched = requestUrlMatcher.regex.test(event.url || event.pathname || "");
          return requestUrlMatcher.isNegated ? !isMatched : isMatched;
        }),
      };
    });

    const rotatedSlices = rotateSlices(baseSlices, viewerState.value.startAnchor?.sliceId);
    const hiddenFilteredSlices = hideEditMode.value
      ? rotatedSlices
      : rotatedSlices.filter((slice) => !slice.isHidden);

    const allVisibleOrderMap = new Map(hiddenFilteredSlices.map((slice, index) => [slice.id, index]));
    const sliceGroupMap = new Map();
    for (const group of allGroups) {
      for (const sliceId of group.sliceIds) {
        if (!allVisibleOrderMap.has(sliceId) || sliceGroupMap.has(sliceId)) {
          continue;
        }
        sliceGroupMap.set(sliceId, {
          id: group.id,
          label: group.label,
          color: group.color,
        });
      }
    }

    const filteredSlices = showAllGroups
      ? hiddenFilteredSlices
      : hiddenFilteredSlices.filter((slice) => {
          const currentGroup = sliceGroupMap.get(slice.id);
          return currentGroup ? selectedGroupIdSet.has(currentGroup.id) : false;
        });

    const orderMap = new Map(filteredSlices.map((slice, index) => [slice.id, index]));

    function findPreviousGroupId(sliceId) {
      const currentIndex = orderMap.get(sliceId);
      if (currentIndex == null) {
        return null;
      }

      let previousMatch = null;
      for (const group of allGroups) {
        const lastIndex = group.sliceIds.reduce((latestIndex, memberId) => {
          const memberIndex = orderMap.get(memberId);
          if (memberIndex == null || memberIndex >= currentIndex) {
            return latestIndex;
          }
          return latestIndex == null ? memberIndex : Math.max(latestIndex, memberIndex);
        }, null);

        if (lastIndex == null) {
          continue;
        }

        if (!previousMatch || lastIndex > previousMatch.lastIndex) {
          previousMatch = {
            groupId: group.id,
            lastIndex,
          };
        }
      }

      return previousMatch?.groupId ?? null;
    }

    let cursorPx = 0;
    return filteredSlices.map((slice, index) => {
      const currentZoom = clampZoom(viewerState.value.zoom);
      const displayWidthPx = Math.max(144, slice.durationMs * currentZoom);
      const currentGroup = sliceGroupMap.get(slice.id) || null;
      const layoutSlice = {
        ...slice,
        displayWidthPx,
        displayLeftPx: cursorPx,
        thumbnailDisplayWidthPx: THUMBNAIL_SLICE_WIDTH_PX,
        orderIndex: index,
        hasOffset: slice.offsetMs !== 0,
        isStartAnchor: viewerState.value.startAnchor?.sliceId === slice.id,
        isEndAnchor: viewerState.value.endAnchor?.sliceId === slice.id,
        currentGroupId: currentGroup?.id || null,
        currentGroupLabel: currentGroup?.label || "",
        currentGroupColor: currentGroup?.color || "",
        previousGroupId: findPreviousGroupId(slice.id),
        defaultNewGroupLabel: `Group ${mergedGroups.value.length + 1}`,
      };
      cursorPx += displayWidthPx + slice.offsetMs * currentZoom;
      return layoutSlice;
    });
  });

  const recordingGroups = computed(() =>
    buildRecordingGroups(visibleSlices.value, viewerState.value.recordingGroupStates)
  );

  const selectedSlice = computed(() =>
    visibleSlices.value.find((slice) => slice.id === selectedSliceId.value) || null
  );

  const roundSummary = computed(
    () => rounds.value.find((round) => round.id === selectedRoundId.value) || null
  );

  const timelineWidth = computed(() => {
    const lastSlice = visibleSlices.value.at(-1);
    if (!lastSlice) {
      return 1280;
    }
    return Math.max(1280, lastSlice.displayLeftPx + lastSlice.displayWidthPx + 320);
  });

  const timelineStats = computed(() => ({
    totalSlices: rawTimeline.value?.meta?.sliceCount || 0,
    visibleSlices: visibleSlices.value.length,
    hiddenSlices: viewerState.value.hiddenSliceIds.length,
    groups: filteredGroups.value.length,
    requestEvents: rawTimeline.value?.meta?.requestEventCount || 0,
    recordingEvents: rawTimeline.value?.meta?.recordingEventCount || 0,
  }));

  const activeOffsetCount = computed(() => Object.keys(viewerState.value.offsets || {}).length);

  watch(
    visibleSlices,
    (nextSlices) => {
      if (!activeRequestDetail.value) {
        return;
      }

      const matchedEvent = nextSlices
        .find((slice) => slice.id === activeRequestDetail.value.sliceId)
        ?.requestEvents.find((event) => event.id === activeRequestDetail.value.eventId);

      if (!matchedEvent) {
        activeRequestDetail.value = null;
      }
    },
    { immediate: true }
  );

  function cleanupGroups(groupList) {
    return groupList.filter((group) => group.sliceIds.length > 0);
  }

  function removeSliceFromGroups(sliceId) {
    if (rawTimeline.value?.groups) {
      rawTimeline.value.groups = cleanupGroups(
        rawTimeline.value.groups.map((group) => ({
          ...group,
          sliceIds: group.sliceIds.filter((memberId) => memberId !== sliceId),
        }))
      );
    }

    localGroups.value = cleanupGroups(
      localGroups.value.map((group) => ({
        ...group,
        sliceIds: group.sliceIds.filter((memberId) => memberId !== sliceId),
      }))
    );
  }

  function nextGroupColor(index) {
    return GROUP_COLORS[index % GROUP_COLORS.length];
  }

  function createGroupAtSlice(sliceId) {
    return createNamedGroupAtSlice(sliceId, null);
  }

  function createNamedGroupAtSlice(sliceId, requestedLabel) {
    removeSliceFromGroups(sliceId);

    const groupIndex = mergedGroups.value.length + 1;
    const fallbackLabel = `Group ${groupIndex}`;
    const nextLabel = String(requestedLabel || "").trim() || fallbackLabel;
    const nextGroup = {
      id: `local-group-${Date.now()}-${groupIndex}`,
      label: nextLabel,
      color: nextGroupColor(groupIndex - 1),
      sliceIds: [sliceId],
    };

    localGroups.value = [...localGroups.value, nextGroup];
    return nextGroup.id;
  }

  function appendSliceToGroup(groupId, sliceId) {
    if (rawTimeline.value?.groups?.some((group) => group.id === groupId)) {
      rawTimeline.value.groups = rawTimeline.value.groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        return {
          ...group,
          sliceIds: [...new Set([...group.sliceIds, sliceId])],
        };
      });
      return true;
    }

    if (localGroups.value.some((group) => group.id === groupId)) {
      localGroups.value = localGroups.value.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        return {
          ...group,
          sliceIds: [...new Set([...group.sliceIds, sliceId])],
        };
      });
      return true;
    }

    return false;
  }

  function assignSliceToPreviousGroup(sliceId) {
    const targetSlice = visibleSlices.value.find((slice) => slice.id === sliceId);
    const previousGroupId = targetSlice?.previousGroupId;
    if (!previousGroupId) {
      return false;
    }

    removeSliceFromGroups(sliceId);
    return appendSliceToGroup(previousGroupId, sliceId);
  }

  function renameGroup(groupId, nextLabel) {
    const trimmedLabel = String(nextLabel || "").trim();
    if (!trimmedLabel) {
      return false;
    }

    let didUpdate = false;

    if (rawTimeline.value?.groups?.some((group) => group.id === groupId)) {
      rawTimeline.value.groups = rawTimeline.value.groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        didUpdate = true;
        return {
          ...group,
          label: trimmedLabel,
        };
      });
    }

    if (localGroups.value.some((group) => group.id === groupId)) {
      localGroups.value = localGroups.value.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        didUpdate = true;
        return {
          ...group,
          label: trimmedLabel,
        };
      });
    }

    return didUpdate;
  }

  function updateOffsets(nextOffsets) {
    viewerState.value = {
      ...viewerState.value,
      offsets: nextOffsets,
    };
  }

  function setSliceOffset(sliceId, nextOffset) {
    const numericOffset = Number(nextOffset || 0);
    const nextOffsets = { ...(viewerState.value.offsets || {}) };

    if (!numericOffset) {
      delete nextOffsets[sliceId];
    } else {
      nextOffsets[sliceId] = numericOffset;
    }

    updateOffsets(nextOffsets);
  }

  function nudgeSliceOffset(sliceId, delta) {
    const current = Number(viewerState.value.offsets?.[sliceId] || 0);
    setSliceOffset(sliceId, current + delta);
  }

  async function setSelectedRoundId(roundId) {
    if (!roundId || roundId === selectedRoundId.value) {
      return;
    }

    selectedRoundId.value = roundId;
    await loadTimeline(roundId);
  }

  function setSelectedGroupIds(nextGroupIds) {
    viewerState.value = {
      ...viewerState.value,
      selectedGroupIds: normalizeSelectedGroupIds(nextGroupIds, mergedGroups.value),
    };
  }

  function setRequestKindFilter(nextKinds) {
    viewerState.value = {
      ...viewerState.value,
      requestKindFilter: normalizeRequestKindFilter(nextKinds),
    };
  }

  function setRequestUrlPattern(nextPattern) {
    viewerState.value = {
      ...viewerState.value,
      requestUrlPattern: String(nextPattern || ""),
    };
  }

  function setZoom(nextZoom) {
    viewerState.value = {
      ...viewerState.value,
      zoom: clampZoom(nextZoom),
    };
  }

  function setBaselinePreviewStartSec(nextValue) {
    baselinePreviewStartSec.value = Math.max(0, Number(nextValue || 0));
  }

  function setBaselinePreviewEndSec(nextValue) {
    baselinePreviewEndSec.value = Math.max(0, Number(nextValue || 0));
  }

  function setBaselineCapturePointsText(nextValue) {
    baselineCapturePointsText.value = String(nextValue || "");
  }

  function setRecordingGroupMode(groupId, mode) {
    const nextMode = normalizeRecordingGroupMode(mode);
    const nextStates = { ...(viewerState.value.recordingGroupStates || {}) };

    if (nextMode === DEFAULT_RECORDING_GROUP_MODE) {
      delete nextStates[groupId];
    } else {
      nextStates[groupId] = {
        mode: nextMode,
      };
    }

    viewerState.value = {
      ...viewerState.value,
      recordingGroupStates: nextStates,
    };
  }

  async function runBaselinePreview() {
    if (!selectedRoundId.value) {
      return;
    }

    baselineBusy.value = true;
    baselineStatus.value = "previewing";
    baselineError.value = "";

    try {
      baselinePreviewResult.value = await fetchJson(
        `/api/rounds/${selectedRoundId.value}/baseline/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startSec: Number(baselinePreviewStartSec.value || 0),
            endSec: Number(baselinePreviewEndSec.value || 0),
            capturePointsSec: parseCapturePointsText(baselineCapturePointsText.value),
          }),
        }
      );
      baselinePreviewSliceOverrides.value = buildPreviewThumbnailOverrideMap(
        rawTimeline.value?.slices || [],
        baselinePreviewResult.value
      );
      baselineStatus.value = "preview-ready";
      await loadBaselineConfig();
    } catch (previewError) {
      baselineStatus.value = "error";
      baselineError.value =
        previewError instanceof Error ? previewError.message : String(previewError);
    } finally {
      baselineBusy.value = false;
    }
  }

  async function applyBaseline() {
    if (!selectedRoundId.value) {
      return;
    }

    baselineBusy.value = true;
    baselineStatus.value = "applying";
    baselineError.value = "";

    try {
      await fetchJson(`/api/rounds/${selectedRoundId.value}/baseline/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      baselinePreviewSliceOverrides.value = {};
      await loadRoundIndex();
      await loadTimeline(selectedRoundId.value);
      baselineStatus.value = "applied";
    } catch (applyError) {
      baselineStatus.value = "error";
      baselineError.value =
        applyError instanceof Error ? applyError.message : String(applyError);
    } finally {
      baselineBusy.value = false;
    }
  }

  function toggleHiddenSlice(sliceId) {
    const hiddenSliceIds = new Set(viewerState.value.hiddenSliceIds || []);
    if (hiddenSliceIds.has(sliceId)) {
      hiddenSliceIds.delete(sliceId);
    } else {
      hiddenSliceIds.add(sliceId);
    }

    viewerState.value = {
      ...viewerState.value,
      hiddenSliceIds: Array.from(hiddenSliceIds),
    };
  }

  function startPickingStartAnchor() {
    interactionMode.value = "start";
    draftStartTarget.value = null;
  }

  function confirmStartAnchor() {
    if (!draftStartTarget.value) {
      return;
    }

    viewerState.value = {
      ...viewerState.value,
      startAnchor: draftStartTarget.value,
    };
    interactionMode.value = "inspect";
  }

  function clearStartAnchor() {
    viewerState.value = {
      ...viewerState.value,
      startAnchor: null,
    };
    draftStartTarget.value = null;
    interactionMode.value = "inspect";
  }

  function startPickingEndAnchor() {
    interactionMode.value = "end";
    draftEndTarget.value = null;
  }

  function confirmEndAnchor() {
    if (!draftEndTarget.value) {
      return;
    }

    viewerState.value = {
      ...viewerState.value,
      endAnchor: draftEndTarget.value,
    };
    interactionMode.value = "inspect";
  }

  function clearEndAnchor() {
    viewerState.value = {
      ...viewerState.value,
      endAnchor: null,
    };
    draftEndTarget.value = null;
    interactionMode.value = "inspect";
  }

  function toggleHideEditMode() {
    hideEditMode.value = !hideEditMode.value;
    interactionMode.value = hideEditMode.value ? "hide" : "inspect";
  }

  function clearHiddenSlices() {
    viewerState.value = {
      ...viewerState.value,
      hiddenSliceIds: [],
    };
  }

  function resetViewerState() {
    if (!selectedRoundId.value) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm("確定要將目前 round 的控制台設定重設為預設值嗎？")
    ) {
      return;
    }

    viewerState.value = createDefaultViewerState(selectedRoundId.value);
    selectedSliceId.value = rawTimeline.value?.slices?.[0]?.id ?? null;
    hideEditMode.value = false;
    draftStartTarget.value = null;
    draftEndTarget.value = null;
    activeRequestDetail.value = null;
    interactionMode.value = "inspect";
  }

  function cancelInteractionMode() {
    interactionMode.value = hideEditMode.value ? "hide" : "inspect";
    draftStartTarget.value = null;
    draftEndTarget.value = null;
  }

  function handleSliceClick(sliceId) {
    const slice = visibleSlices.value.find((candidate) => candidate.id === sliceId);
    if (!slice) {
      return;
    }

    selectedSliceId.value = sliceId;

    if (interactionMode.value === "hide" && hideEditMode.value) {
      toggleHiddenSlice(sliceId);
      return;
    }

    if (interactionMode.value === "start") {
      draftStartTarget.value = createAnchorTarget("slice", slice, slice);
      return;
    }

    if (interactionMode.value === "end") {
      draftEndTarget.value = createAnchorTarget("slice", slice, slice);
    }
  }

  function handleLaneEventClick(sliceId, event, sourceType) {
    selectedSliceId.value = sliceId;

    if (sourceType === "request" && interactionMode.value === "inspect") {
      const isSameTarget =
        activeRequestDetail.value?.sliceId === sliceId &&
        activeRequestDetail.value?.eventId === event.id;

      activeRequestDetail.value = isSameTarget
        ? null
        : {
            sliceId,
            eventId: event.id,
          };
      return;
    }

    if (interactionMode.value === "start") {
      const slice = visibleSlices.value.find((candidate) => candidate.id === sliceId);
      draftStartTarget.value = createAnchorTarget(sourceType, event, slice);
    }
  }

  return {
    activeOffsetCount,
    activeRequestDetail,
    apiWritable,
    applyBaseline,
    baselineBusy,
    baselineCapturePointsText,
    baselineConfig,
    baselineError,
    baselinePreviewEndSec,
    baselinePreviewResult,
    baselinePreviewStartSec,
    baselineStatus,
    draftEndTarget,
    draftStartTarget,
    error,
    hideEditMode,
    interactionMode,
    isLoading,
    loadInitialData,
    groupFilterOptions,
    mergedGroups,
    filteredGroups,
    requestKindFilter,
    requestUrlPattern,
    requestUrlRegexState,
    roundSummary,
    rounds,
    saveError,
    saveStatus,
    selectedRoundId,
    selectedGroupIds,
    selectedSlice,
    selectedSliceId,
    recordingGroups,
    timelineStats,
    timelineWidth,
    viewerState,
    visibleSlices,
    zoom,
    assignSliceToPreviousGroup,
    cancelInteractionMode,
    clearEndAnchor,
    clearHiddenSlices,
    clearStartAnchor,
    confirmEndAnchor,
    confirmStartAnchor,
    createGroupAtSlice,
    createNamedGroupAtSlice,
    handleLaneEventClick,
    handleSliceClick,
    loadTimeline,
    nudgeSliceOffset,
    renameGroup,
    runBaselinePreview,
    setRecordingGroupMode,
    setSliceOffset,
    setBaselineCapturePointsText,
    setBaselinePreviewEndSec,
    setBaselinePreviewStartSec,
    setRequestKindFilter,
    setSelectedRoundId,
    setSelectedGroupIds,
    setRequestUrlPattern,
    setZoom,
    startPickingEndAnchor,
    startPickingStartAnchor,
    toggleHideEditMode,
    resetViewerState,
  };
}
