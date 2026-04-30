/**
 * Queue Worker — Runs exclusively on the iMac.
 *
 * Architecture:
 *   1. On boot: reset any stalled/zombie jobs from a previous crash
 *   2. Poll loop: check for a crawl trigger (VA requesting a new batch)
 *   3. Poll loop: check for pending jobs and process one at a time
 *   4. Heartbeat: ping Vercel KV every 5 minutes to show "Online" status
 *   5. Exponential backoff: when queue is empty, back off to 60s poll max
 *
 * Concurrency Safety:
 *   Uses kvQueue.claimNextJob() which calls Redis LPOP — atomic, no races.
 *   Never call this on more than one machine simultaneously.
 */

import {
  kvQueue,
  crawlTrigger,
  macHeartbeat,
  type KVJob,
} from "./job-queue-kv";
import {
  crawlUploadsDrive,
  ensureYouTubePath,
  downloadFile,
  uploadFile,
  verifyUploadExists,
  purgeIfOld,
  buildFinishedFilename,
} from "./drive-crawler";
import { processVideo } from "./video-processor";
import { sendDiscordNotification } from "./discord-webhook";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// ── State ──────────────────────────────────────────────────────────────

let isWorkerRunning = false;
let jobsProcessedToday = 0;
let currentJobName: string | undefined;

// ── Backoff Config ─────────────────────────────────────────────────────

const BACKOFF_STEPS_MS = [0, 5000, 10000, 20000, 30000, 60000];

// ── Public Entry Point ─────────────────────────────────────────────────

export async function startQueueWorker() {
  if (isWorkerRunning) {
    console.log("[Queue Worker] Already running — skipping duplicate start.");
    return;
  }
  isWorkerRunning = true;
  console.log("[Queue Worker] Starting on iMac...");

  // ── Startup: Crash Recovery ───────────────────────────────────────
  const kvReady = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  if (!kvReady) {
    console.warn("[Queue Worker] ⚠️  KV_REST_API_URL / KV_REST_API_TOKEN not set in .env.local.");
    console.warn("[Queue Worker] ⚠️  Worker is paused. Add KV credentials and restart the server.");
    // Don't crash — just idle. The server stays healthy for the Script Generator.
    return;
  }
  try {
    const activeBatches = await kvQueue.getActiveBatchIds();
    if (activeBatches.length > 0) {
      const resetCount = await kvQueue.resetStalledJobs(activeBatches);
      if (resetCount > 0) {
        console.log(`[Queue Worker] ⚡ Crash recovery: reset ${resetCount} stalled jobs back to pending.`);
      }
    }
  } catch (err) {
    console.error("[Queue Worker] Crash recovery failed:", err);
  }

  // ── Startup: Send "Online" heartbeat ─────────────────────────────
  await sendHeartbeat("idle");

  // ── Heartbeat timer (every 5 min) ────────────────────────────────
  const heartbeatInterval = setInterval(async () => {
    const depth = await kvQueue.getPendingCount().catch(() => 0);
    await sendHeartbeat(currentJobName ? "processing" : "idle", depth);
  }, 5 * 60 * 1000);

  // ── Nightly pruner (every 24h) ───────────────────────────────────
  const pruneInterval = setInterval(async () => {
    try {
      const pruned = await kvQueue.pruneOldJobs();
      if (pruned > 0) console.log(`[Queue Worker] 🗑️ Pruned ${pruned} completed job records older than 7 days.`);
    } catch (err) {
      console.warn("[Queue Worker] Prune warning:", err);
    }
  }, 24 * 60 * 60 * 1000);

  // ── Main Poll Loop ────────────────────────────────────────────────
  let emptyCount = 0;
  while (true) {
    try {
      // 1. Check for a crawl trigger from Vercel/VA
      const trigger = await crawlTrigger.claimAndClear();
      if (trigger) {
        console.log(`[Queue Worker] 📡 Crawl trigger received from ${trigger.requestedBy || "dashboard"}. Running crawl...`);
        await runCrawlAndEnqueue(trigger);
        emptyCount = 0; // Reset backoff since we have work
        continue; // Immediately loop back to pick up the new jobs
      }

      // 2. Claim the next pending job
      const job = await kvQueue.claimNextJob();
      if (!job) {
        // Queue is empty — apply exponential backoff
        const backoffMs = BACKOFF_STEPS_MS[Math.min(emptyCount, BACKOFF_STEPS_MS.length - 1)];
        emptyCount = Math.min(emptyCount + 1, BACKOFF_STEPS_MS.length - 1);
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
        continue;
      }

      // Queue had a job — reset backoff
      emptyCount = 0;
      currentJobName = job.videoName;
      await processJob(job);
      currentJobName = undefined;

      // Heartbeat after every job
      const depth = await kvQueue.getPendingCount().catch(() => 0);
      await sendHeartbeat("idle", depth);

    } catch (err) {
      console.error("[Queue Worker] Critical loop error:", err);
      await sleep(10000);
    }
  }

  // Cleanup (unreachable in practice but good practice)
  clearInterval(heartbeatInterval);
  clearInterval(pruneInterval);
}

// ── Crawl & Enqueue ────────────────────────────────────────────────────

async function runCrawlAndEnqueue(trigger: { specificDate?: string; targetFolderId?: string }) {
  const uploadsDriveId = process.env.UPLOADS_DRIVE_ID;
  const youtubeDriveId = process.env.YOUTUBE_DRIVE_ID;

  if (!uploadsDriveId || !youtubeDriveId) {
    console.error("[Queue Worker] Missing UPLOADS_DRIVE_ID or YOUTUBE_DRIVE_ID env vars.");
    return;
  }

  try {
    const crawlResult = await crawlUploadsDrive(
      uploadsDriveId,
      youtubeDriveId,
      trigger.specificDate,
      trigger.targetFolderId
    );

    if (crawlResult.jobs.length === 0) {
      console.log(`[Queue Worker] Crawl complete — nothing to process. Skipped: ${crawlResult.skipped}`);
      return;
    }

    const batchId = crypto.randomUUID();
    for (const job of crawlResult.jobs) {
      await kvQueue.addJob({
        id: crypto.randomUUID(),
        batchId,
        videoName: `${job.producerName}/${job.softwareName}/${job.dateFolder}/${job.videoFile.name}`,
        fileMetaJson: JSON.stringify(job),
      });
    }

    console.log(`[Queue Worker] ✅ Crawl queued ${crawlResult.jobs.length} jobs (batch: ${batchId.slice(0, 8)}). Skipped: ${crawlResult.skipped}.`);

    if (crawlResult.errors.length > 0) {
      console.warn(`[Queue Worker] Crawl errors (${crawlResult.errors.length}):`, crawlResult.errors);
    }
  } catch (err) {
    console.error("[Queue Worker] Crawl failed:", err);
  }
}

// ── Job Processor ──────────────────────────────────────────────────────

async function processJob(job: KVJob) {
  const youtubeDriveId = process.env.YOUTUBE_DRIVE_ID;
  if (!youtubeDriveId) {
    await kvQueue.updateJob(job.id, {
      status: "error",
      errorMessage: "Missing YOUTUBE_DRIVE_ID environment variable",
    });
    return;
  }

  let fileMeta: any;
  try {
    fileMeta = JSON.parse(job.fileMetaJson);
  } catch {
    await kvQueue.updateJob(job.id, { status: "error", errorMessage: "Invalid job metadata JSON" });
    return;
  }

  const finishedName = buildFinishedFilename(fileMeta.producerName, fileMeta.videoFile.name, fileMeta.version);

  // ── Smart Skip Pre-Check ────────────────────────────────────────
  try {
    const ytDateFolderId = await ensureYouTubePath(youtubeDriveId, fileMeta.softwareName, fileMeta.dateFolder);
    const alreadyExists = await verifyUploadExists(ytDateFolderId, finishedName);
    if (alreadyExists) {
      console.log(`[Queue Worker] ⏭️ Smart Skip: ${finishedName} already on YouTube Drive.`);
      await kvQueue.updateJob(job.id, {
        status: "skipped",
        skipReason: "Already completed on YouTube Drive",
      });
      await checkBatchCompletion(job.batchId);
      return;
    }
  } catch (err) {
    console.warn(`[Queue Worker] Smart Skip check failed for ${finishedName}, proceeding anyway:`, err);
  }

  // ── Local Temp Paths ────────────────────────────────────────────
  const tmpDir = path.join(os.tmpdir(), "nightshift", job.batchId);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const localVideoPath = path.join(tmpDir, `raw_${fileMeta.videoFile.name}`);
  const localAudioPath = path.join(tmpDir, `raw_${fileMeta.audioFile.name}`);
  const localOutputPath = path.join(tmpDir, finishedName);

  try {
    // ── Download ──────────────────────────────────────────────────
    await kvQueue.updateJob(job.id, { status: "downloading" });
    console.log(`[Queue Worker] ⬇️  Downloading: ${job.videoName}`);
    await downloadFile(fileMeta.videoFile.id, localVideoPath);
    await downloadFile(fileMeta.audioFile.id, localAudioPath);

    // ── FFmpeg Render ─────────────────────────────────────────────
    await kvQueue.updateJob(job.id, { status: "processing", renderPercent: 0 });
    console.log(`[Queue Worker] 🎬 Processing: ${finishedName}`);

    let lastKVUpdate = 0;
    const result = await processVideo({
      inputVideoPath: localVideoPath,
      inputAudioPath: localAudioPath,
      outputPath: localOutputPath,
      onProgress: async (percent) => {
        // Throttle KV writes to max 1 per 3 seconds during render
        const now = Date.now();
        if (now - lastKVUpdate > 3000 || percent === 100) {
          lastKVUpdate = now;
          await kvQueue.updateJob(job.id, { status: "processing", renderPercent: percent });
        }
      },
    });

    // ── Upload ────────────────────────────────────────────────────
    await kvQueue.updateJob(job.id, { status: "uploading", renderPercent: 100 });
    const ytDateFolderId = await ensureYouTubePath(youtubeDriveId, fileMeta.softwareName, fileMeta.dateFolder);

    const uploadName = result.needsReview ? `REVIEW_${finishedName}` : finishedName;
    if (result.needsReview) {
      console.warn(`[Queue Worker] ⚠️  Duration mismatch: ${result.reviewReason}`);
    }

    await uploadFile(localOutputPath, uploadName, ytDateFolderId);

    // ── Watertight Verification ───────────────────────────────────
    const verified = await verifyUploadExists(ytDateFolderId, uploadName);
    if (!verified) {
      throw new Error(`Upload verification failed: ${uploadName} not found in YouTube Drive.`);
    }

    // ── 48-Hour Purge ─────────────────────────────────────────────
    try {
      const vPurged = await purgeIfOld(fileMeta.videoFile.id, fileMeta.videoFile.createdTime);
      const aPurged = await purgeIfOld(fileMeta.audioFile.id, fileMeta.audioFile.createdTime);
      if (vPurged) console.log(`[Queue Worker] 🗑️  Purged raw video: ${fileMeta.videoFile.name}`);
      if (aPurged) console.log(`[Queue Worker] 🗑️  Purged raw audio: ${fileMeta.audioFile.name}`);
    } catch (purgeErr) {
      console.warn(`[Queue Worker] Purge warning:`, purgeErr);
    }

    // ── Mark Done ────────────────────────────────────────────────
    await kvQueue.updateJob(job.id, { status: "done", renderPercent: 100 });
    jobsProcessedToday++;
    console.log(`[Queue Worker] ✅ Finished: ${uploadName}`);

    await checkBatchCompletion(job.batchId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Queue Worker] ❌ Failed: ${fileMeta.videoFile?.name} — ${message}`);
    await kvQueue.updateJob(job.id, {
      status: "error",
      errorMessage: message,
    });
  } finally {
    cleanupFile(localVideoPath);
    cleanupFile(localAudioPath);
    cleanupFile(localOutputPath);
    try {
      if (fs.existsSync(tmpDir) && fs.readdirSync(tmpDir).length === 0) {
        fs.rmdirSync(tmpDir);
      }
    } catch {}
  }
}

// ── Batch Completion Check ─────────────────────────────────────────────

async function checkBatchCompletion(batchId: string) {
  try {
    const jobs = await kvQueue.getBatchJobs(batchId);
    const allTerminal = jobs.every(
      (j) => j.status === "done" || j.status === "error" || j.status === "skipped"
    );

    if (allTerminal && jobs.length > 0) {
      const done = jobs.filter((j) => j.status === "done").length;
      const skipped = jobs.filter((j) => j.status === "skipped").length;
      const errors = jobs.filter((j) => j.status === "error").length;

      const msg = `✅ **Processed:** ${done}\n⏭️ **Skipped:** ${skipped}\n❌ **Errors:** ${errors}`;
      await sendDiscordNotification(
        `🏭 Batch Complete (${batchId.slice(0, 8)})`,
        msg,
        errors > 0 ? 0xFF6B00 : 0x00FF00
      );
    }
  } catch (err) {
    console.warn("[Queue Worker] Batch completion check error:", err);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

async function sendHeartbeat(status: "idle" | "processing", queueDepth?: number) {
  try {
    const depth = queueDepth ?? await kvQueue.getPendingCount();
    await macHeartbeat.ping({
      status,
      currentJob: currentJobName,
      jobsProcessedToday,
      queueDepth: depth,
    });
  } catch (err) {
    // Don't crash the worker if heartbeat fails
    console.warn("[Queue Worker] Heartbeat write failed:", err);
  }
}

function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
