<script setup>
import { onMounted } from "vue";
import { NConfigProvider, NMessageProvider } from "naive-ui";
import TimelineViewer from "./components/TimelineViewer.vue";
import { useTimelineModel } from "./composables/useTimelineModel";

const timeline = useTimelineModel();

const themeOverrides = {
  common: {
    primaryColor: "#355C7D",
    primaryColorHover: "#43698A",
    primaryColorPressed: "#26455f",
    borderRadius: "16px",
    fontFamily: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
  },
  Card: {
    borderRadius: "20px",
  },
};

onMounted(() => {
  timeline.loadInitialData();
});
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <main class="app-shell">
        <TimelineViewer
          :active-offset-count="timeline.activeOffsetCount.value"
          :active-request-detail="timeline.activeRequestDetail.value"
          :api-writable="timeline.apiWritable.value"
          :baseline-busy="timeline.baselineBusy.value"
          :baseline-capture-points-text="timeline.baselineCapturePointsText.value"
          :baseline-config="timeline.baselineConfig.value"
          :baseline-error="timeline.baselineError.value"
          :baseline-preview-end-sec="timeline.baselinePreviewEndSec.value"
          :baseline-preview-result="timeline.baselinePreviewResult.value"
          :baseline-preview-start-sec="timeline.baselinePreviewStartSec.value"
          :baseline-status="timeline.baselineStatus.value"
          :draft-end-target="timeline.draftEndTarget.value"
          :draft-start-target="timeline.draftStartTarget.value"
          :error="timeline.error.value"
          :group-filter-options="timeline.groupFilterOptions.value"
          :groups="timeline.filteredGroups.value"
          :hide-edit-mode="timeline.hideEditMode.value"
          :interaction-mode="timeline.interactionMode.value"
          :is-loading="timeline.isLoading.value"
          :request-kind-filter="timeline.requestKindFilter.value"
          :request-url-pattern="timeline.requestUrlPattern.value"
          :request-url-pattern-error="timeline.requestUrlRegexState.value.error"
          :round-summary="timeline.roundSummary.value"
          :rounds="timeline.rounds.value"
          :recording-groups="timeline.recordingGroups.value"
          :save-error="timeline.saveError.value"
          :save-status="timeline.saveStatus.value"
          :selected-group-ids="timeline.selectedGroupIds.value"
          :selected-round-id="timeline.selectedRoundId.value"
          :selected-slice="timeline.selectedSlice.value"
          :slices="timeline.visibleSlices.value"
          :timeline-stats="timeline.timelineStats.value"
          :timeline-width="timeline.timelineWidth.value"
          :viewer-state="timeline.viewerState.value"
          :zoom="timeline.zoom.value"
          @cancel-interaction="timeline.cancelInteractionMode"
          @clear-end-anchor="timeline.clearEndAnchor"
          @clear-hidden-slices="timeline.clearHiddenSlices"
          @clear-start-anchor="timeline.clearStartAnchor"
          @confirm-end-anchor="timeline.confirmEndAnchor"
          @confirm-start-anchor="timeline.confirmStartAnchor"
          @assign-slice-to-previous-group="timeline.assignSliceToPreviousGroup"
          @apply-baseline="timeline.applyBaseline"
          @create-group-at-slice="timeline.createNamedGroupAtSlice"
          @handle-lane-event-click="timeline.handleLaneEventClick"
          @handle-slice-click="timeline.handleSliceClick"
          @nudge-slice-offset="timeline.nudgeSliceOffset"
          @reset-viewer-state="timeline.resetViewerState"
          @rename-group="timeline.renameGroup"
          @run-baseline-preview="timeline.runBaselinePreview"
          @set-recording-group-mode="timeline.setRecordingGroupMode"
          @set-baseline-capture-points-text="timeline.setBaselineCapturePointsText"
          @set-baseline-preview-end-sec="timeline.setBaselinePreviewEndSec"
          @set-baseline-preview-start-sec="timeline.setBaselinePreviewStartSec"
          @set-request-kind-filter="timeline.setRequestKindFilter"
          @set-request-url-pattern="timeline.setRequestUrlPattern"
          @set-selected-group-ids="timeline.setSelectedGroupIds"
          @set-selected-round-id="timeline.setSelectedRoundId"
          @set-slice-offset="timeline.setSliceOffset"
          @set-zoom="timeline.setZoom"
          @start-picking-end-anchor="timeline.startPickingEndAnchor"
          @start-picking-start-anchor="timeline.startPickingStartAnchor"
          @toggle-hide-edit-mode="timeline.toggleHideEditMode"
        />
      </main>
    </n-message-provider>
  </n-config-provider>
</template>
