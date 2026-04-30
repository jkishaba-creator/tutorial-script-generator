/**
 * Video Processor — Core FFmpeg Speed-Sync Engine.
 *
 * Takes a 2x speed silent OBS recording and slows it to 1x speed while
 * overlaying a 1x voiceover audio track.
 *
 * Encoder: libx264 (software) with Constant Rate Factor (CRF) encoding.
 * CRF lets the encoder allocate bits intelligently — using very few bits
 * on static screens (most of a tutorial) and more during mouse/cursor
 * movement. This produces significantly smaller files than fixed-bitrate.
 *
 * Key math: setpts=2.0*PTS doubles each frame's timestamp, effectively
 * halving the playback speed from 2x → 1x.
 *
 * NOTE: ffmpeg is installed via Homebrew at /opt/homebrew/bin/ffmpeg.
 * The Next.js server process does not inherit the Homebrew PATH, so we
 * set the binary path explicitly here.
 *
 * TUNING REFERENCE:
 *   CRF 23 = libx264 default (highest quality, larger files)
 *   CRF 25 = current setting (sharp text, ~8-12 MB per 3-min tutorial)
 *   CRF 28 = consultant target (smallest files, ~5-8 MB — test for artifacts)
 *   Preset: veryfast = best speed/quality balance for overnight batches
 */

import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

// ── FFmpeg Binary Path ───────────────────────────────────────────────
// Homebrew on Apple Silicon installs to /opt/homebrew.
// We fall back to the system PATH if the Homebrew binary doesn't exist
// (e.g. in a CI or Docker environment).
const FFMPEG_PATH = fs.existsSync("/opt/homebrew/bin/ffmpeg")
  ? "/opt/homebrew/bin/ffmpeg"
  : "ffmpeg";
const FFPROBE_PATH = fs.existsSync("/opt/homebrew/bin/ffprobe")
  ? "/opt/homebrew/bin/ffprobe"
  : "ffprobe";

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

// ── Types ───────────────────────────────────────────────────────────

export interface ProcessOptions {
  /** Absolute path to the 2x speed silent video */
  inputVideoPath: string;
  /** Absolute path to the 1x voiceover audio */
  inputAudioPath: string;
  /** Absolute path for the rendered output */
  outputPath: string;
  /** Callback for FFmpeg progress updates (0-100) */
  onProgress?: (percent: number) => void;
}

export interface ProcessResult {
  /** Whether the output was flagged for manual review */
  needsReview: boolean;
  /** Reason for review flag, if any */
  reviewReason?: string;
  /** Duration of the final rendered video in seconds */
  videoDurationSec: number;
  /** Duration of the audio track in seconds */
  audioDurationSec: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Probe a media file and return its duration in seconds.
 */
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata?.format?.duration;
      if (typeof duration !== "number" || isNaN(duration)) {
        return reject(new Error(`Could not determine duration for: ${filePath}`));
      }
      resolve(duration);
    });
  });
}

// ── Main Processor ──────────────────────────────────────────────────

/**
 * Slow the 2x video to 1x and overlay the voiceover audio.
 *
 * Single-pass pipeline (all in one FFmpeg command):
 *   1. Input the 2x speed video (silent)
 *   2. Input the 1x voiceover audio
 *   3. setpts=2.0*PTS  — slow video from 2x → 1x speed
 *   4. scale=1920:1080 — ensure consistent 1080p output
 *   5. libx264 CRF 25, veryfast preset — smart variable bitrate
 *   6. yuv420p + faststart — browser/mobile web compatible
 *   7. Flag for manual review if audio/video durations diverge > 2s
 */
export async function processVideo(opts: ProcessOptions): Promise<ProcessResult> {
  const { inputVideoPath, inputAudioPath, outputPath, onProgress } = opts;

  // Validate inputs exist
  if (!fs.existsSync(inputVideoPath)) {
    throw new Error(`Input video not found: ${inputVideoPath}`);
  }
  if (!fs.existsSync(inputAudioPath)) {
    throw new Error(`Input audio not found: ${inputAudioPath}`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Probe audio duration before processing
  const audioDurationSec = await probeDuration(inputAudioPath);

  // Run FFmpeg
  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      // Input 0: the 2x speed video (silent)
      .input(inputVideoPath)
      // Input 1: the voiceover audio
      .input(inputAudioPath)
      // Complex filter (single pass):
      //   Step 1: setpts=2.0*PTS — slow from 2x to 1x speed
      //   Step 2: scale=1920:1080 — normalise to 1080p
      // Both filters are chained here so FFmpeg only decodes the video once.
      .complexFilter([
        {
          filter: "setpts",
          options: "2.0*PTS",
          inputs: "0:v",
          outputs: "slowvid",
        },
        {
          filter: "scale",
          options: "1920:1080",
          inputs: "slowvid",
          outputs: "scaled",
        },
      ])
      // Map the scaled video and the voiceover audio into the output
      .outputOptions([
        "-map", "[scaled]",
        "-map", "1:a",
        // libx264 software encoder — CRF-based variable bitrate
        // CRF 25: sharp text, ~8-12 MB per 3-min tutorial.
        // Lower this to 23 for more quality, raise to 28 for smaller files.
        "-c:v", "libx264",
        "-crf", "25",
        // veryfast: best balance of speed and compression for overnight batches
        "-preset", "veryfast",
        // High profile: uses better compression tools for fine spatial detail
        "-profile:v", "high",
        // Web-standard pixel format (required for all browsers + mobile)
        "-pix_fmt", "yuv420p",
        // faststart: moves MP4 metadata to the front so videos play before
        // fully downloaded (critical for readyto.ai streaming)
        "-movflags", "+faststart",
        // Lean AAC audio — 128k is plenty for voiceover
        "-c:a", "aac",
        "-b:a", "128k",
        // End when the shorter stream ends
        "-shortest",
        // Overwrite output if it exists
        "-y",
      ])
      .output(outputPath);

    // Progress reporting
    command.on("progress", (progress) => {
      if (onProgress && progress.percent !== undefined) {
        // Clamp to 0-100
        const pct = Math.min(100, Math.max(0, Math.round(progress.percent)));
        onProgress(pct);
      }
    });

    command.on("end", () => resolve());
    command.on("error", (err) => reject(err));

    command.run();
  });

  // Probe the rendered output duration
  const videoDurationSec = await probeDuration(outputPath);

  // ── Quality Audit: File Size Check ──────────────────────────────
  const fileSizeBytes = fs.statSync(outputPath).size;
  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  // CRF encoding produces smaller files for static content — floor is 2 MB
  if (fileSizeMB < 2) {
    console.warn(`⚠️ File size warning: ${outputPath} is only ${fileSizeMB.toFixed(1)} MB (expected 2–50 MB). May be too short or low quality.`);
  } else if (fileSizeMB > 50) {
    console.warn(`⚠️ File size warning: ${outputPath} is ${fileSizeMB.toFixed(1)} MB (expected 5–50 MB). Consider checking video length or bitrate.`);
  } else {
    console.log(`📦 File size OK: ${fileSizeMB.toFixed(1)} MB`);
  }

  // Duration mismatch check: flag if > 2 seconds difference
  const durationDiff = Math.abs(videoDurationSec - audioDurationSec);
  const needsReview = durationDiff > 2;
  const reviewReason = needsReview
    ? `Duration mismatch: video=${videoDurationSec.toFixed(1)}s, audio=${audioDurationSec.toFixed(1)}s (diff=${durationDiff.toFixed(1)}s)`
    : undefined;

  return {
    needsReview,
    reviewReason,
    videoDurationSec,
    audioDurationSec,
  };
}
