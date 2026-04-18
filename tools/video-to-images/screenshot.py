from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import cv2
from scenedetect import SceneManager, VideoManager
from scenedetect.detectors import ContentDetector


VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".MP4", ".AVI", ".MOV", ".MKV"}
OVERLAP_COMPARE_WIDTH = 320
OVERLAP_RATIO_STEP = 0.05


@dataclass
class CaptureRecord:
    scene_index: int
    start_frame: int
    end_frame: int
    capture_frame: int
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    relative_timecode: str
    absolute_timestamp: str | None
    image_file: str
    image_path: str
    page_hint: str
    review_note: str
    overlap_ratio: float
    overlap_similarity: float
    overlap_direction: str


@dataclass
class SkippedCaptureRecord:
    scene_index: int
    start_frame: int
    end_frame: int
    relative_timecode: str
    compared_with_scene_index: int
    compared_with_image_file: str
    overlap_ratio: float
    overlap_similarity: float
    overlap_direction: str
    reason: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract representative page images from scene changes and export a manifest "
            "that can be matched with VIDEO/HAR/Recording timelines."
        )
    )
    parser.add_argument("--input", default="./video", help="Video file or directory.")
    parser.add_argument("--output", default="./screenshots", help="Output directory.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=1.0,
        help="Scene detection threshold. Smaller is more sensitive. Default: 1.0",
    )
    parser.add_argument(
        "--minlen",
        type=int,
        default=15,
        help="Minimum scene length in frames. Default: 15",
    )
    parser.add_argument(
        "--video-start",
        type=str,
        default=None,
        help=(
            "Optional video start timestamp, for example "
            "'2026-04-17 11:21:22' or '2026-04-17T11:21:22'."
        ),
    )
    parser.add_argument(
        "--capture-offset-frames",
        type=int,
        default=8,
        help=(
            "Frames to skip from the start of each scene before capturing the "
            "representative image. Helps avoid transition/animation frames. "
            "If the scene is shorter than this offset, the middle frame is used instead. "
            "Default: 8 (~0.27s at 30fps)"
        ),
    )
    parser.add_argument(
        "--scroll-overlap-threshold",
        type=float,
        default=0.9,
        help=(
            "Skip the next capture when vertical scroll overlap with the previous kept "
            "capture reaches this ratio. Use 0 to disable. Default: 0.5"
        ),
    )
    parser.add_argument(
        "--scroll-overlap-similarity",
        type=float,
        default=0.92,
        help=(
            "Required similarity score for the overlapped area when applying scroll "
            "dedupe. Range: 0-1. Default: 0.92"
        ),
    )
    return parser.parse_args()


def parse_video_start(value: str | None) -> datetime | None:
    if not value:
        return None

    supported_formats = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
    )

    for time_format in supported_formats:
        try:
            return datetime.strptime(value, time_format)
        except ValueError:
            continue

    raise ValueError(
        "--video-start format is invalid. Use 'YYYY-MM-DD HH:MM:SS' "
        "or 'YYYY-MM-DDTHH:MM:SS'."
    )


def find_video_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]

    if input_path.is_dir():
        return sorted(
            path for path in input_path.iterdir() if path.suffix in VIDEO_EXTENSIONS
        )

    return []


def ensure_clean_output(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    for path in output_dir.iterdir():
        if not path.is_file():
            continue
        if path.name in {"manifest.json", "manifest.csv"} or path.name.startswith("scene-"):
            path.unlink()


def format_timecode(seconds: float) -> str:
    total_milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def format_timecode_for_filename(seconds: float) -> str:
    return format_timecode(seconds).replace(":", "-")


def load_video_metadata(video_file: Path) -> tuple[float, int]:
    capture = cv2.VideoCapture(str(video_file))
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f"Unable to open video: {video_file}")

    fps = capture.get(cv2.CAP_PROP_FPS)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.release()

    if fps <= 0:
        raise RuntimeError(f"Unable to read FPS from video: {video_file}")

    return fps, total_frames


def validate_ratio(name: str, value: float, *, allow_zero: bool = False) -> float:
    if allow_zero and value == 0:
        return value
    if value <= 0 or value > 1:
        allowed_range = "[0, 1]" if allow_zero else "(0, 1]"
        raise ValueError(f"{name} must be in the range {allowed_range}.")
    return value


def detect_scene_ranges(
    video_file: Path, threshold: float, min_scene_length: int
) -> list[tuple[int, int]]:
    video_manager = VideoManager([str(video_file)])
    scene_manager = SceneManager()
    scene_manager.add_detector(
        ContentDetector(threshold=threshold, min_scene_len=min_scene_length)
    )

    try:
        video_manager.start()
        scene_manager.detect_scenes(frame_source=video_manager)
        scene_list = scene_manager.get_scene_list()
    finally:
        video_manager.release()

    scene_ranges: list[tuple[int, int]] = []
    for start_timecode, end_timecode in scene_list:
        start_frame = start_timecode.frame_num
        end_frame = max(start_frame, end_timecode.frame_num - 1)
        scene_ranges.append((start_frame, end_frame))

    return scene_ranges


def fallback_scene_range(total_frames: int) -> list[tuple[int, int]]:
    if total_frames <= 0:
        return [(0, 0)]
    return [(0, total_frames - 1)]


def read_frame(capture: cv2.VideoCapture, frame_number: int):
    capture.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    ok, frame = capture.read()
    if not ok:
        return None
    return frame


def save_image(output_path: Path, frame) -> bool:
    return bool(cv2.imwrite(str(output_path), frame))


def normalize_frame_for_overlap(frame):
    if frame is None:
        return None

    height, width = frame.shape[:2]
    if width <= 0 or height <= 0:
        return None

    target_width = min(width, OVERLAP_COMPARE_WIDTH)
    if target_width != width:
        target_height = max(1, round(height * target_width / width))
        frame = cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)

    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def build_overlap_candidate_ratios(min_ratio: float) -> list[float]:
    ratios: set[float] = {round(min_ratio, 2), 1.0}
    current = min_ratio
    while current < 1.0:
        ratios.add(round(current, 2))
        current += OVERLAP_RATIO_STEP
    return sorted(ratios)


def calculate_similarity(previous_section, current_section) -> float:
    diff = cv2.absdiff(previous_section, current_section)
    return max(0.0, 1.0 - (float(diff.mean()) / 255.0))


def detect_vertical_scroll_overlap(
    previous_frame,
    current_frame,
    min_overlap_ratio: float,
    similarity_threshold: float,
) -> dict:
    previous_gray = normalize_frame_for_overlap(previous_frame)
    current_gray = normalize_frame_for_overlap(current_frame)

    if previous_gray is None or current_gray is None:
        return {
            "overlap_ratio": 0.0,
            "overlap_similarity": 0.0,
            "overlap_direction": "none",
            "should_skip": False,
        }

    min_height = min(previous_gray.shape[0], current_gray.shape[0])
    if min_height <= 1:
        return {
            "overlap_ratio": 0.0,
            "overlap_similarity": 0.0,
            "overlap_direction": "none",
            "should_skip": False,
        }

    best_match = {
        "overlap_ratio": 0.0,
        "overlap_similarity": 0.0,
        "overlap_direction": "none",
        "should_skip": False,
    }

    for overlap_ratio in build_overlap_candidate_ratios(min_overlap_ratio):
        overlap_pixels = max(1, int(round(min_height * overlap_ratio)))

        comparisons = (
            (
                "scroll-down",
                previous_gray[-overlap_pixels:, :],
                current_gray[:overlap_pixels, :],
            ),
            (
                "scroll-up",
                previous_gray[:overlap_pixels, :],
                current_gray[-overlap_pixels:, :],
            ),
        )

        for direction, previous_section, current_section in comparisons:
            similarity = calculate_similarity(previous_section, current_section)
            if similarity > best_match["overlap_similarity"]:
                best_match = {
                    "overlap_ratio": round(overlap_ratio, 3),
                    "overlap_similarity": round(similarity, 3),
                    "overlap_direction": direction,
                    "should_skip": overlap_ratio >= min_overlap_ratio
                    and similarity >= similarity_threshold,
                }

    best_match["should_skip"] = (
        best_match["overlap_ratio"] >= min_overlap_ratio
        and best_match["overlap_similarity"] >= similarity_threshold
    )

    return best_match


def compute_capture_frame(start_frame: int, end_frame: int, offset_frames: int) -> int:
    scene_length = end_frame - start_frame
    if scene_length < offset_frames:
        return start_frame + scene_length // 2
    return start_frame + offset_frames


def build_capture_record(
    scene_index: int,
    start_frame: int,
    end_frame: int,
    fps: float,
    image_file: str,
    video_output_dir: Path,
    video_start: datetime | None,
    overlap_ratio: float,
    overlap_similarity: float,
    overlap_direction: str,
    capture_offset_frames: int = 0,
) -> CaptureRecord:
    capture_frame = compute_capture_frame(start_frame, end_frame, capture_offset_frames)
    start_seconds = start_frame / fps
    end_seconds = end_frame / fps if end_frame >= start_frame else start_seconds
    duration_seconds = max(0.0, end_seconds - start_seconds)
    absolute_timestamp = None
    if video_start is not None:
        absolute_timestamp = (
            video_start + timedelta(seconds=start_seconds)
        ).isoformat(timespec="milliseconds")

    return CaptureRecord(
        scene_index=scene_index,
        start_frame=start_frame,
        end_frame=end_frame,
        capture_frame=capture_frame,
        start_seconds=round(start_seconds, 3),
        end_seconds=round(end_seconds, 3),
        duration_seconds=round(duration_seconds, 3),
        relative_timecode=format_timecode(start_seconds),
        absolute_timestamp=absolute_timestamp,
        image_file=image_file,
        image_path=str(video_output_dir / image_file),
        page_hint="",
        review_note="",
        overlap_ratio=round(overlap_ratio, 3),
        overlap_similarity=round(overlap_similarity, 3),
        overlap_direction=overlap_direction,
    )


def extend_capture_record(record: CaptureRecord, end_frame: int, fps: float) -> None:
    if end_frame <= record.end_frame:
        return

    record.end_frame = end_frame
    end_seconds = end_frame / fps
    record.end_seconds = round(end_seconds, 3)
    record.duration_seconds = round(max(0.0, end_seconds - (record.start_frame / fps)), 3)


def write_manifest_json(output_path: Path, payload: dict) -> None:
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_manifest_csv(output_path: Path, records: Iterable[CaptureRecord]) -> None:
    fieldnames = list(CaptureRecord.__annotations__.keys())
    with output_path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))


def process_video(
    video_file: Path,
    output_root: Path,
    threshold: float,
    min_scene_length: int,
    video_start: datetime | None,
    scroll_overlap_threshold: float,
    scroll_overlap_similarity: float,
    capture_offset_frames: int = 8,
) -> dict:
    fps, total_frames = load_video_metadata(video_file)
    duration_seconds = round(total_frames / fps, 3) if total_frames else 0.0

    print(f"\nProcessing video: {video_file}")
    print(f"FPS: {fps:.3f}, total frames: {total_frames}, duration: {duration_seconds:.3f}s")

    video_output_dir = output_root / video_file.stem
    ensure_clean_output(video_output_dir)

    scene_ranges = detect_scene_ranges(video_file, threshold, min_scene_length)
    if not scene_ranges:
        print("No scene changes detected. Saving the first frame as a fallback.")
        scene_ranges = fallback_scene_range(total_frames)
    else:
        print(f"Detected {len(scene_ranges)} scene ranges.")

    capture = cv2.VideoCapture(str(video_file))
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f"Unable to reopen video for frame extraction: {video_file}")

    records: list[CaptureRecord] = []
    skipped_records: list[SkippedCaptureRecord] = []
    last_kept_frame = None
    last_kept_record: CaptureRecord | None = None
    try:
        for index, (start_frame, end_frame) in enumerate(scene_ranges, start=1):
            frame = read_frame(capture, start_frame)
            if frame is None:
                print(f"Skip scene {index}: unable to read frame {start_frame}.")
                continue

            image_file = (
                f"scene-{index:04d}__{format_timecode_for_filename(start_frame / fps)}"
                f"__f{start_frame:06d}.jpg"
            )
            image_path = video_output_dir / image_file

            overlap_result = {
                "overlap_ratio": 0.0,
                "overlap_similarity": 0.0,
                "overlap_direction": "none",
                "should_skip": False,
            }
            if scroll_overlap_threshold > 0 and last_kept_frame is not None and last_kept_record:
                overlap_result = detect_vertical_scroll_overlap(
                    last_kept_frame,
                    frame,
                    min_overlap_ratio=scroll_overlap_threshold,
                    similarity_threshold=scroll_overlap_similarity,
                )
                if overlap_result["should_skip"]:
                    extend_capture_record(last_kept_record, end_frame, fps)
                    skipped_records.append(
                        SkippedCaptureRecord(
                            scene_index=index,
                            start_frame=start_frame,
                            end_frame=end_frame,
                            relative_timecode=format_timecode(start_frame / fps),
                            compared_with_scene_index=last_kept_record.scene_index,
                            compared_with_image_file=last_kept_record.image_file,
                            overlap_ratio=overlap_result["overlap_ratio"],
                            overlap_similarity=overlap_result["overlap_similarity"],
                            overlap_direction=overlap_result["overlap_direction"],
                            reason="scroll-overlap>=threshold",
                        )
                    )
                    print(
                        f"Skip scene {index}: overlap {overlap_result['overlap_ratio']:.3f} "
                        f"with scene {last_kept_record.scene_index} "
                        f"({overlap_result['overlap_direction']}, "
                        f"similarity={overlap_result['overlap_similarity']:.3f})."
                    )
                    continue

            capture_frame = compute_capture_frame(start_frame, end_frame, capture_offset_frames)
            save_frame = read_frame(capture, capture_frame) if capture_frame != start_frame else frame
            if save_frame is None:
                save_frame = frame

            if not save_image(image_path, save_frame):
                print(f"Skip scene {index}: unable to write {image_file}.")
                continue

            record = build_capture_record(
                scene_index=index,
                start_frame=start_frame,
                end_frame=end_frame,
                fps=fps,
                image_file=image_file,
                video_output_dir=video_output_dir,
                video_start=video_start,
                overlap_ratio=overlap_result["overlap_ratio"],
                overlap_similarity=overlap_result["overlap_similarity"],
                overlap_direction=overlap_result["overlap_direction"],
                capture_offset_frames=capture_offset_frames,
            )
            records.append(record)
            last_kept_frame = frame
            last_kept_record = record
            print(
                f"Saved {image_file} "
                f"(relative={record.relative_timecode}, absolute={record.absolute_timestamp})"
            )
    finally:
        capture.release()

    manifest = {
        "video_file": str(video_file),
        "video_name": video_file.name,
        "video_stem": video_file.stem,
        "fps": round(fps, 3),
        "total_frames": total_frames,
        "duration_seconds": duration_seconds,
        "raw_scene_count": len(scene_ranges),
        "capture_count": len(records),
        "skipped_overlap_count": len(skipped_records),
        "threshold": threshold,
        "min_scene_length": min_scene_length,
        "scroll_overlap_threshold": scroll_overlap_threshold,
        "scroll_overlap_similarity": scroll_overlap_similarity,
        "capture_offset_frames": capture_offset_frames,
        "video_start": video_start.isoformat(timespec="seconds") if video_start else None,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "captures": [asdict(record) for record in records],
        "skipped_captures": [asdict(record) for record in skipped_records],
    }

    write_manifest_json(video_output_dir / "manifest.json", manifest)
    write_manifest_csv(video_output_dir / "manifest.csv", records)
    print(
        f"Manifest written: {video_output_dir / 'manifest.json'} and "
        f"{video_output_dir / 'manifest.csv'}"
    )
    return manifest


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_root = Path(args.output)
    video_start = parse_video_start(args.video_start)
    scroll_overlap_threshold = validate_ratio(
        "--scroll-overlap-threshold",
        args.scroll_overlap_threshold,
        allow_zero=True,
    )
    scroll_overlap_similarity = validate_ratio(
        "--scroll-overlap-similarity",
        args.scroll_overlap_similarity,
    )

    video_files = find_video_files(input_path)
    if not video_files:
        raise SystemExit(f"No video files found under: {input_path}")

    output_root.mkdir(parents=True, exist_ok=True)

    manifests = []
    for video_file in video_files:
        manifests.append(
            process_video(
                video_file=video_file,
                output_root=output_root,
                threshold=args.threshold,
                min_scene_length=args.minlen,
                video_start=video_start,
                scroll_overlap_threshold=scroll_overlap_threshold,
                scroll_overlap_similarity=scroll_overlap_similarity,
                capture_offset_frames=args.capture_offset_frames,
            )
        )

    summary_path = output_root / "summary.json"
    write_manifest_json(summary_path, {"videos": manifests})
    print(f"\nDone. Summary written to: {summary_path}")


if __name__ == "__main__":
    main()
