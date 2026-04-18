<script setup>
import { computed, ref, watch } from "vue";
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NEmpty,
  NInput,
  NPopover,
  NSelect,
  NSkeleton,
  NSlider,
  NTabPane,
  NTabs,
  NTag,
} from "naive-ui";

const props = defineProps({
  activeOffsetCount: {
    type: Number,
    default: 0,
  },
  activeRequestDetail: {
    type: Object,
    default: null,
  },
  apiWritable: {
    type: Boolean,
    default: false,
  },
  baselineBusy: {
    type: Boolean,
    default: false,
  },
  baselineCapturePointsText: {
    type: String,
    default: "",
  },
  baselineConfig: {
    type: Object,
    default: null,
  },
  baselineError: {
    type: String,
    default: "",
  },
  baselinePreviewEndSec: {
    type: Number,
    default: 60,
  },
  baselinePreviewResult: {
    type: Object,
    default: null,
  },
  baselinePreviewStartSec: {
    type: Number,
    default: 0,
  },
  baselineStatus: {
    type: String,
    default: "idle",
  },
  draftEndTarget: {
    type: Object,
    default: null,
  },
  draftStartTarget: {
    type: Object,
    default: null,
  },
  error: {
    type: String,
    default: "",
  },
  groupFilterOptions: {
    type: Array,
    default: () => [],
  },
  groups: {
    type: Array,
    default: () => [],
  },
  hideEditMode: {
    type: Boolean,
    default: false,
  },
  interactionMode: {
    type: String,
    default: "inspect",
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  requestKindFilter: {
    type: Array,
    default: () => [],
  },
  requestUrlPattern: {
    type: String,
    default: "",
  },
  requestUrlPatternError: {
    type: String,
    default: "",
  },
  roundSummary: {
    type: Object,
    default: null,
  },
  rounds: {
    type: Array,
    default: () => [],
  },
  saveError: {
    type: String,
    default: "",
  },
  saveStatus: {
    type: String,
    default: "idle",
  },
  selectedGroupIds: {
    type: Array,
    default: () => [],
  },
  selectedRoundId: {
    type: String,
    default: "",
  },
  selectedSlice: {
    type: Object,
    default: null,
  },
  slices: {
    type: Array,
    default: () => [],
  },
  timelineStats: {
    type: Object,
    default: () => ({}),
  },
  timelineWidth: {
    type: Number,
    default: 1280,
  },
  viewerState: {
    type: Object,
    default: () => ({}),
  },
  zoom: {
    type: Number,
    default: 0.01,
  },
});

const emit = defineEmits([
  "cancel-interaction",
  "clear-end-anchor",
  "clear-hidden-slices",
  "clear-start-anchor",
  "confirm-end-anchor",
  "confirm-start-anchor",
  "assign-slice-to-previous-group",
  "apply-baseline",
  "create-group-at-slice",
  "handle-lane-event-click",
  "handle-slice-click",
  "nudge-slice-offset",
  "reset-viewer-state",
  "run-baseline-preview",
  "set-baseline-capture-points-text",
  "set-baseline-preview-end-sec",
  "set-baseline-preview-start-sec",
  "set-request-kind-filter",
  "set-request-url-pattern",
  "set-selected-group-ids",
  "set-selected-round-id",
  "set-slice-offset",
  "set-zoom",
  "start-picking-end-anchor",
  "start-picking-start-anchor",
  "toggle-hide-edit-mode",
]);

const roundOptions = computed(() =>
  props.rounds.map((round) => ({
    label: round.id,
    value: round.id,
  }))
);

const expandedLaneKeys = ref(new Set());
const requestLaneHeight = computed(() => laneHeightFor("requestEvents"));
const recordingLaneHeight = computed(() => laneHeightFor("recordingEvents"));
const REQUEST_DETAIL_PANEL_HEIGHT = 420;
const activeRequestDetailTab = ref("response-text");

watch(
  () => props.activeRequestDetail,
  (nextDetail) => {
    if (nextDetail) {
      activeRequestDetailTab.value = "response-text";
    }
  },
  { deep: true }
);

function laneEvents(slice, laneKey) {
  return laneKey === "requestEvents" ? slice.requestEvents : slice.recordingEvents;
}

function laneExpansionKey(sliceId, laneKey) {
  return `${sliceId}:${laneKey}`;
}

function isLaneExpanded(sliceId, laneKey) {
  return expandedLaneKeys.value.has(laneExpansionKey(sliceId, laneKey));
}

function toggleLaneExpanded(sliceId, laneKey) {
  const next = new Set(expandedLaneKeys.value);
  const key = laneExpansionKey(sliceId, laneKey);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedLaneKeys.value = next;
}

function hasCollapsedLaneEvents(slice, laneKey) {
  return laneEvents(slice, laneKey).length > 2;
}

function visibleLaneEvents(slice, laneKey) {
  const events = laneEvents(slice, laneKey);
  if (!hasCollapsedLaneEvents(slice, laneKey) || isLaneExpanded(slice.id, laneKey)) {
    return events;
  }
  return events.slice(0, 2);
}

function isRequestDetailOpen(sliceId, eventId) {
  return (
    props.activeRequestDetail?.sliceId === sliceId &&
    props.activeRequestDetail?.eventId === eventId
  );
}

function requestDetailHeightFor(slice) {
  const activeEvent = visibleLaneEvents(slice, "requestEvents").find((event) =>
    isRequestDetailOpen(slice.id, event.id)
  );

  return activeEvent ? REQUEST_DETAIL_PANEL_HEIGHT : 0;
}

function laneHeightFor(laneKey) {
  const maxHeight = props.slices.reduce((currentMax, slice) => {
    const visibleCount = visibleLaneEvents(slice, laneKey).length;
    const toggleCount = hasCollapsedLaneEvents(slice, laneKey) ? 1 : 0;
    const baseHeight = visibleCount * 82 + toggleCount * 44;
    const detailHeight = laneKey === "requestEvents" ? requestDetailHeightFor(slice) : 0;
    return Math.max(currentMax, baseHeight + detailHeight);
  }, 0);

  return Math.max(184, maxHeight + 28);
}

function groupSpan(group, slices) {
  const members = slices.filter((slice) => group.sliceIds.includes(slice.id));
  if (!members.length) {
    return null;
  }

  const first = members[0];
  const last = members[members.length - 1];
  return {
    left: first.displayLeftPx,
    width: last.displayLeftPx + last.displayWidthPx - first.displayLeftPx,
  };
}

function formatOffset(offsetMs) {
  const numericOffset = Number(offsetMs || 0);
  if (numericOffset > 0) {
    return `+${numericOffset}`;
  }
  return String(numericOffset);
}

function anchorTagType(anchor, draftAnchor) {
  if (draftAnchor && anchor?.itemId === draftAnchor.itemId) {
    return "warning";
  }
  return "default";
}
</script>

<template>
  <div class="viewer-shell">
    <section v-if="error" class="status-panel error-panel">
      {{ error }}
    </section>

    <section v-else-if="isLoading" class="status-panel">
      <n-skeleton text :repeat="8" />
    </section>

    <section v-else-if="!slices.length" class="status-panel">
      <n-empty description="尚未載入 timeline data" />
    </section>

    <section v-else class="workspace">
      <div class="timeline-column">
        <section class="timeline-panel">
          <div class="timeline-scroll">
            <div class="timeline-grid" :style="{ gridTemplateColumns: `116px ${timelineWidth}px` }">
              <div class="lane-name">Offset</div>
              <div class="lane offset-lane">
                <div
                  v-for="slice in slices"
                  :key="`${slice.id}-offset`"
                  class="offset-chip"
                  :class="{
                    active: slice.hasOffset,
                    selected: selectedSlice?.id === slice.id,
                    hidden: slice.isHidden,
                  }"
                  :style="{
                    left: `${slice.displayLeftPx}px`,
                    width: `${slice.displayWidthPx}px`,
                  }"
                >
                  <button
                    class="offset-button"
                    type="button"
                    @click.stop="emit('nudge-slice-offset', slice.id, -100)"
                  >
                    -
                  </button>
                  <span class="offset-value">{{ formatOffset(slice.offsetMs) }}</span>
                  <button
                    class="offset-button"
                    type="button"
                    @click.stop="emit('nudge-slice-offset', slice.id, 100)"
                  >
                    +
                  </button>
                </div>
              </div>

              <div class="lane-name">Groups</div>
              <div class="lane group-lane">
                <div
                  v-for="slice in slices"
                  :key="`${slice.id}-group-decision`"
                  class="group-decision"
                  :class="{ active: Boolean(slice.currentGroupId) }"
                  :style="{
                    left: `${slice.displayLeftPx}px`,
                    width: `${slice.displayWidthPx}px`,
                  }"
                >
                  <div class="group-decision-actions">
                    <button
                      class="group-action-button"
                      type="button"
                      @click.stop="emit('create-group-at-slice', slice.id)"
                    >
                      +
                    </button>
                    <button
                      class="group-action-button secondary"
                      type="button"
                      :disabled="!slice.previousGroupId"
                      @click.stop="emit('assign-slice-to-previous-group', slice.id)"
                    >
                      -
                    </button>
                  </div>
                  <span class="group-decision-label">
                    {{ slice.currentGroupLabel || "ungrouped" }}
                  </span>
                </div>
                <template v-for="group in groups" :key="group.id">
                  <div
                    v-if="groupSpan(group, slices)"
                    class="group-pill"
                    :style="{
                      left: `${groupSpan(group, slices).left}px`,
                      width: `${groupSpan(group, slices).width}px`,
                      background: group.color,
                    }"
                  >
                    {{ group.label }}
                  </div>
                </template>
              </div>

              <div class="lane-name">Thumbnails</div>
              <div class="lane thumbnail-lane">
                <div
                  v-for="slice in slices"
                  :key="slice.id"
                  class="slice-block"
                  :class="{
                    active: selectedSlice?.id === slice.id,
                    hidden: slice.isHidden,
                    'start-anchor': slice.isStartAnchor,
                    'end-anchor': slice.isEndAnchor,
                    draft: draftStartTarget?.sliceId === slice.id || draftEndTarget?.sliceId === slice.id,
                  }"
                  :style="{
                    left: `${slice.displayLeftPx}px`,
                    width: `${slice.thumbnailDisplayWidthPx}px`,
                  }"
                  @click="emit('handle-slice-click', slice.id)"
                >
                  <n-popover trigger="hover" placement="top" :show-arrow="false">
                    <template #trigger>
                      <button class="slice-thumb-button" type="button">
                        <img :src="slice.thumbnailSrc" :alt="slice.id" class="slice-thumb" />
                      </button>
                    </template>
                    <div class="thumb-preview">
                      <img
                        :src="slice.thumbnailSrc"
                        :alt="`${slice.id} focus preview`"
                        class="thumb-preview-image"
                      />
                      <p>{{ slice.relativeTimecode }}</p>
                    </div>
                  </n-popover>

                  <div class="slice-meta">
                    <span>{{ slice.relativeTimecode }}</span>
                    <span>#{{ slice.sceneIndex }}</span>
                  </div>

                  <div class="slice-meta flags-row">
                    <n-tag v-if="slice.isStartAnchor" size="small" type="warning" :bordered="false">
                      START
                    </n-tag>
                    <n-tag v-if="slice.isEndAnchor" size="small" type="success" :bordered="false">
                      END
                    </n-tag>
                    <n-tag
                      v-if="slice.isHidden"
                      size="small"
                      :bordered="false"
                      type="default"
                    >
                      HIDDEN
                    </n-tag>
                  </div>
                </div>
              </div>

              <div class="lane-name">Recording</div>
              <div class="lane recording-lane" :style="{ minHeight: `${recordingLaneHeight}px` }">
                <div
                  v-for="slice in slices"
                  :key="`${slice.id}-recording`"
                  class="lane-slice-panel"
                  :style="{
                    left: `${slice.displayLeftPx}px`,
                  }"
                >
                  <button
                    v-for="event in visibleLaneEvents(slice, 'recordingEvents')"
                    :key="event.id"
                    class="lane-event recording-event"
                    type="button"
                    @click.stop="emit('handle-lane-event-click', slice.id, event, 'recording')"
                  >
                    <div class="event-topline">
                      <n-tag size="small" type="info" :bordered="false">
                        step {{ event.stepIndex }}
                      </n-tag>
                      <span>{{ event.type }}</span>
                    </div>
                    <div class="event-title">{{ event.label }}</div>
                  </button>
                  <button
                    v-if="hasCollapsedLaneEvents(slice, 'recordingEvents')"
                    class="lane-toggle-button"
                    type="button"
                    @click.stop="toggleLaneExpanded(slice.id, 'recordingEvents')"
                  >
                    {{ isLaneExpanded(slice.id, 'recordingEvents') ? "收起" : "更多" }}
                  </button>
                </div>
              </div>

              <div class="lane-name">HAR</div>
              <div class="lane request-lane" :style="{ minHeight: `${requestLaneHeight}px` }">
                <div
                  v-for="slice in slices"
                  :key="`${slice.id}-requests`"
                  class="lane-slice-panel"
                  :style="{
                    left: `${slice.displayLeftPx}px`,
                  }"
                >
                  <div
                    v-for="event in visibleLaneEvents(slice, 'requestEvents')"
                    :key="event.id"
                    class="request-event-stack"
                  >
                    <button
                      class="lane-event request-event"
                      :class="{ active: isRequestDetailOpen(slice.id, event.id) }"
                      type="button"
                      :style="{ borderColor: event.color }"
                      @click.stop="emit('handle-lane-event-click', slice.id, event, 'request')"
                    >
                      <div class="event-topline">
                        <n-tag
                          size="small"
                          :bordered="false"
                          :color="{ color: event.color, textColor: '#fff' }"
                        >
                          {{ event.kind }}
                        </n-tag>
                        <span>{{ event.method }} {{ event.status }}</span>
                      </div>
                      <div class="event-title">{{ event.pathname }}</div>
                      <div class="event-subline">
                        <span>{{ event.durationMs }} ms</span>
                        <span>{{ isRequestDetailOpen(slice.id, event.id) ? "點擊收起" : "點擊展開" }}</span>
                      </div>
                    </button>
                    <div
                      v-if="isRequestDetailOpen(slice.id, event.id)"
                      class="request-detail-panel"
                      @click.stop
                    >
                      <n-tabs
                        v-model:value="activeRequestDetailTab"
                        type="line"
                        animated
                        class="request-detail-tabs"
                      >
                        <n-tab-pane name="response-text" tab="Response Text">
                          <section class="request-detail-section">
                            <pre class="request-detail-code">{{
                              event.detail?.responseText || "(empty)"
                            }}</pre>
                          </section>
                        </n-tab-pane>
                        <n-tab-pane name="response" tab="Response">
                          <section class="request-detail-section">
                            <pre class="request-detail-code">{{
                              event.detail?.response || `Status: ${event.status}`
                            }}</pre>
                          </section>
                        </n-tab-pane>
                        <n-tab-pane name="request" tab="Request">
                          <section class="request-detail-section">
                            <pre class="request-detail-code">{{
                              event.detail?.request || `${event.method} ${event.url || event.pathname}`
                            }}</pre>
                          </section>
                        </n-tab-pane>
                        <n-tab-pane name="headers" tab="Header">
                          <section class="request-detail-section">
                            <pre class="request-detail-code">{{
                              event.detail?.headers || "(none)"
                            }}</pre>
                          </section>
                        </n-tab-pane>
                      </n-tabs>
                    </div>
                  </div>
                  <button
                    v-if="hasCollapsedLaneEvents(slice, 'requestEvents')"
                    class="lane-toggle-button"
                    type="button"
                    @click.stop="toggleLaneExpanded(slice.id, 'requestEvents')"
                  >
                    {{ isLaneExpanded(slice.id, 'requestEvents') ? "收起" : "更多" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="control-panel">
        <n-card title="Control Panel" size="small" :bordered="false">
          <div class="control-stack">
            <section class="control-section">
              <p class="control-label">Source Directory</p>
              <n-select
                :value="selectedRoundId"
                :options="roundOptions"
                @update:value="emit('set-selected-round-id', $event)"
              />
            </section>

            <section class="control-section">
              <p class="control-label">Groups</p>
              <n-select
                multiple
                filterable
                :value="selectedGroupIds"
                :options="groupFilterOptions"
                max-tag-count="responsive"
                placeholder="預設顯示全部 group"
                @update:value="emit('set-selected-group-ids', $event)"
              />
              <p class="helper-text">
                預設是「全部」；改選特定 group 後，只顯示該 group 內的 timeline 內容。
              </p>
            </section>

            <section class="control-section">
              <p class="control-label">Workspace Stats</p>
              <div class="stats-stack">
                <n-tag size="small" :bordered="false">{{ timelineStats.visibleSlices }} / {{ timelineStats.totalSlices }} slices</n-tag>
                <n-tag size="small" :bordered="false">{{ activeOffsetCount }} offsets</n-tag>
                <n-tag size="small" :bordered="false">{{ timelineStats.hiddenSlices }} hidden</n-tag>
                <n-tag size="small" :bordered="false">{{ timelineStats.groups }} groups</n-tag>
              </div>
            </section>

            <section class="control-section">
              <p class="control-label">Time Zoom</p>
              <n-slider
                :value="zoom"
                :step="0.01"
                :min="0.02"
                :max="0.18"
                @update:value="emit('set-zoom', $event)"
              />
            </section>

            <section class="control-section">
              <p class="control-label">Save State</p>
              <div class="save-status-row">
                <n-tag size="small" :type="apiWritable ? 'success' : 'warning'" :bordered="false">
                  {{ apiWritable ? saveStatus || "ready" : "read-only" }}
                </n-tag>
                <span v-if="viewerState?.updatedAt" class="status-text">
                  {{ viewerState.updatedAt }}
                </span>
              </div>
              <p v-if="saveError" class="helper-text error-text">{{ saveError }}</p>
              <div class="anchor-actions">
                <n-button size="small" tertiary type="error" @click="emit('reset-viewer-state')">
                  RESET
                </n-button>
              </div>
              <p class="helper-text">
                會把目前 round 的起終點、隱藏圖、offset、zoom、group filter、HAR kinds 與 regex 恢復為預設值。
              </p>
            </section>

            <section class="control-section">
              <p class="control-label">Baseline Trial</p>
              <div class="anchor-actions">
                <n-button
                  size="small"
                  type="primary"
                  :loading="baselineBusy"
                  @click="emit('run-baseline-preview')"
                >
                  試轉 60 秒
                </n-button>
                <n-button
                  size="small"
                  tertiary
                  :loading="baselineBusy"
                  @click="emit('apply-baseline')"
                >
                  全部套用
                </n-button>
              </div>
              <div class="baseline-field-grid">
                <label class="helper-text">submit_login_page.video_ms</label>
                <n-input
                  :value="String(baselineConfig?.config?.submit_login_page?.video_ms ?? '')"
                  type="text"
                  readonly
                  placeholder="請在 source/baseline/page_login.json 設定"
                />
                <label class="helper-text" for="baseline-start-input">試轉開始秒數</label>
                <n-input
                  id="baseline-start-input"
                  :value="String(baselinePreviewStartSec)"
                  type="number"
                  placeholder="預設 0"
                  @update:value="emit('set-baseline-preview-start-sec', Number($event || 0))"
                />
                <label class="helper-text" for="baseline-end-input">試轉結束秒數</label>
                <n-input
                  id="baseline-end-input"
                  :value="String(baselinePreviewEndSec)"
                  type="number"
                  placeholder="預設 60"
                  @update:value="emit('set-baseline-preview-end-sec', Number($event || 60))"
                />
              </div>
              <n-input
                :value="baselineCapturePointsText"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                placeholder="輸入要取圖的秒數，逗號或空白分隔，例如 0, 12.5, 24"
                @update:value="emit('set-baseline-capture-points-text', $event)"
              />
              
              <div class="tag-stack">
                <n-tag size="small" :bordered="false">{{ baselineStatus }}</n-tag>
                <n-tag
                  v-if="baselineConfig?.configFile"
                  size="small"
                  :bordered="false"
                  type="info"
                >
                  {{ baselineConfig.configFile }}
                </n-tag>
                <n-tag v-if="baselinePreviewResult?.images?.length" size="small" :bordered="false" type="success">
                  已套用 {{ baselinePreviewResult.images.length }} 張試轉圖到 Round
                </n-tag>
              </div>
              <p class="helper-text">
                目前定位只使用 `submit_login_page.video_ms`，代表肉眼看到登入按鈕被按下的影片時間。試轉不會再改寫 baseline config。
              </p>
              <p v-if="baselineError" class="helper-text error-text">{{ baselineError }}</p>
            </section>

            <section class="control-section">
              <p class="control-label">HAR Kinds</p>
              <n-checkbox-group
                :value="requestKindFilter"
                @update:value="emit('set-request-kind-filter', $event)"
              >
                <div class="checkbox-row">
                  <n-checkbox value="document-get">document-get</n-checkbox>
                  <n-checkbox value="document-post">document-post</n-checkbox>
                  <n-checkbox value="ajax">ajax</n-checkbox>
                </div>
              </n-checkbox-group>
              <n-input
                :value="requestUrlPattern"
                type="text"
                placeholder="例如 javascript、!javascript、/txn/i"
                @update:value="emit('set-request-url-pattern', $event)"
              />
              <p v-if="requestUrlPatternError" class="helper-text error-text">
                {{ requestUrlPatternError }}
              </p>
              <p v-else class="helper-text">
                支援正向與負向；`javascript` 代表只顯示命中，`!javascript` 代表排除命中，也可用 `/pattern/flags`。
              </p>
            </section>

            <section class="control-section">
              <p class="control-label">Start Point</p>
              <div class="anchor-actions">
                <n-button size="small" secondary @click="emit('start-picking-start-anchor')">
                  選擇起始點
                </n-button>
                <n-button size="small" type="primary" @click="emit('confirm-start-anchor')">
                  確定重排
                </n-button>
                <n-button size="small" tertiary @click="emit('clear-start-anchor')">
                  清除起始點
                </n-button>
              </div>
              <div class="tag-stack">
                <n-tag
                  v-if="viewerState?.startAnchor"
                  size="small"
                  :bordered="false"
                  :type="anchorTagType(viewerState.startAnchor, draftStartTarget)"
                >
                  {{ viewerState.startAnchor.sourceType }} · {{ viewerState.startAnchor.label }}
                </n-tag>
                <n-tag v-if="draftStartTarget" size="small" type="warning" :bordered="false">
                  draft · {{ draftStartTarget.sourceType }} · {{ draftStartTarget.label }}
                </n-tag>
              </div>
              <p class="helper-text">
                在選擇模式下，可點圖片、HAR item、Recording item。確定後會由該 slice 開始重排。
              </p>
            </section>

            <section class="control-section">
              <p class="control-label">End Point</p>
              <div class="anchor-actions">
                <n-button size="small" secondary @click="emit('start-picking-end-anchor')">
                  選擇結束點
                </n-button>
                <n-button size="small" type="primary" @click="emit('confirm-end-anchor')">
                  確定結束點
                </n-button>
                <n-button size="small" tertiary @click="emit('clear-end-anchor')">
                  清除結束點
                </n-button>
              </div>
              <div class="tag-stack">
                <n-tag v-if="viewerState?.endAnchor" size="small" type="success" :bordered="false">
                  {{ viewerState.endAnchor.sourceType }} · {{ viewerState.endAnchor.label }}
                </n-tag>
                <n-tag v-if="draftEndTarget" size="small" type="success" :bordered="false">
                  draft · {{ draftEndTarget.label }}
                </n-tag>
              </div>
              <p class="helper-text">結束點以圖片 slice 為主，其它 lane 會跟著該 slice 對齊。</p>
            </section>

            <section class="control-section">
              <p class="control-label">Hide Images</p>
              <div class="anchor-actions">
                <n-button size="small" secondary @click="emit('toggle-hide-edit-mode')">
                  {{ hideEditMode ? "完成隱藏設定" : "編輯隱藏圖片" }}
                </n-button>
                <n-button size="small" tertiary @click="emit('clear-hidden-slices')">
                  清除隱藏名單
                </n-button>
              </div>
              <div class="tag-stack">
                <n-tag size="small" :bordered="false" :type="hideEditMode ? 'warning' : 'default'">
                  {{ hideEditMode ? "editing" : "applied" }}
                </n-tag>
                <n-tag size="small" :bordered="false">
                  {{ viewerState?.hiddenSliceIds?.length || 0 }} hidden
                </n-tag>
              </div>
              <p class="helper-text">
                編輯模式下所有圖都會顯示，可直接點圖切換是否隱藏；離開編輯模式後，隱藏圖會從主 timeline 收起。
              </p>
            </section>

            <section class="control-section">
              <p class="control-label">Mode Hint</p>
              <p class="helper-text">
                目前模式：<strong>{{ interactionMode }}</strong>
              </p>
              <n-button size="small" tertiary @click="emit('cancel-interaction')">
                取消暫存選擇
              </n-button>
            </section>
          </div>
        </n-card>
      </aside>
    </section>
  </div>
</template>
