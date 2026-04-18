import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  resetDir,
  SAMPLING_DURATION_SECONDS,
  SAMPLING_INTERVAL_SECONDS,
} from "./shared.js";

function formatCaptureSecond(offsetSec) {
  return Number(offsetSec || 0).toFixed(3);
}

export function probeVideoDurationMs(videoPath) {
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

export function extractFrameByOffset(videoPath, offsetSec, outputPath) {
  const formattedOffset = formatCaptureSecond(offsetSec);
  console.log(
    `[video] extract ${path.basename(outputPath)} at ${formattedOffset}s from ${path.basename(videoPath)}`
  );

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

export async function buildSamplingFrames({ videoPath, artifactRoot, videoDurationMs }) {
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
