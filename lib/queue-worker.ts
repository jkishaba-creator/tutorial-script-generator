import { jobQueueDB, Job } from "./job-queue-db";
import { ensureYouTubePath, downloadFile, uploadFile, verifyUploadExists, purgeIfOld, buildFinishedFilename } from "./drive-crawler";
import { processVideo } from "./video-processor";
import { sendDiscordNotification } from "./discord-webhook";
import fs from "fs";
import path from "path";
import os from "os";

let isWorkerRunning = false;

export async function startQueueWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  
  // Try to pick up where we left off
  const resetCount = jobQueueDB.resetStalledJobs();
  if (resetCount > 0) {
    console.log(`[Queue Worker] Reset ${resetCount} stalled jobs from previous crash.`);
  }

  console.log("[Queue Worker] Started polling queue...");

  while (true) {
    try {
      const job = jobQueueDB.getNextPendingJob();
      if (!job) {
        // Sleep for 15 seconds if queue is empty
        await new Promise(resolve => setTimeout(resolve, 15000));
        continue;
      }

      await processJob(job);
      
    } catch (err) {
      console.error("[Queue Worker] Critical worker error:", err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function processJob(job: Job) {
  const youtubeDriveId = process.env.YOUTUBE_DRIVE_ID;
  if (!youtubeDriveId) {
    jobQueueDB.setJobError(job.id, "Missing YOUTUBE_DRIVE_ID environment variable");
    return;
  }

  // Parse file meta
  let fileMeta: any;
  try {
    fileMeta = JSON.parse(job.fileMetaJson);
  } catch (err) {
    jobQueueDB.setJobError(job.id, "Invalid job metadata JSON");
    return;
  }

  const finishedName = buildFinishedFilename(fileMeta.producerName, fileMeta.videoFile.name, fileMeta.version);

  // 1. Smart Skip Pre-Check
  // We do this immediately before starting so we don't process jobs that were completed by someone else
  try {
    const ytDateFolderId = await ensureYouTubePath(youtubeDriveId, fileMeta.softwareName, fileMeta.dateFolder);
    const alreadyExists = await verifyUploadExists(ytDateFolderId, finishedName);
    if (alreadyExists) {
      console.log(`[Queue Worker] Smart Skip: ${finishedName} already exists in YouTube Drive. Skipping.`);
      jobQueueDB.setJobSkipped(job.id, "already completed on Drive");
      return;
    }
  } catch (err) {
    console.warn(`[Queue Worker] Smart Skip check failed for ${finishedName}, proceeding anyway...`, err);
  }

  // Local temp paths
  const tmpDir = path.join(os.tmpdir(), "nightshift", job.batchId);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const localVideoPath = path.join(tmpDir, `raw_${fileMeta.videoFile.name}`);
  const localAudioPath = path.join(tmpDir, `raw_${fileMeta.audioFile.name}`);
  const localOutputPath = path.join(tmpDir, finishedName);

  try {
    // ── Download ──────────────────────────────────────────────
    jobQueueDB.updateJobStatus(job.id, "downloading");
    console.log(`[Queue Worker] Downloading: ${job.videoName}`);

    await downloadFile(fileMeta.videoFile.id, localVideoPath);
    await downloadFile(fileMeta.audioFile.id, localAudioPath);

    // ── FFmpeg Process ────────────────────────────────────────
    jobQueueDB.updateJobStatus(job.id, "processing");
    console.log(`[Queue Worker] Processing: ${finishedName}`);

    let lastProgressTime = 0;
    const result = await processVideo({
      inputVideoPath: localVideoPath,
      inputAudioPath: localAudioPath,
      outputPath: localOutputPath,
      onProgress: (percent) => {
        // Only hit SQLite every 2 seconds to avoid DB lock spam
        const now = Date.now();
        if (now - lastProgressTime > 2000 || percent === 100) {
          jobQueueDB.updateJobStatus(job.id, "processing", percent);
          lastProgressTime = now;
        }
      },
    });

    // ── Upload to YouTube Drive ───────────────────────────────
    jobQueueDB.updateJobStatus(job.id, "uploading", 100);

    const ytDateFolderId = await ensureYouTubePath(youtubeDriveId, fileMeta.softwareName, fileMeta.dateFolder);

    const uploadName = result.needsReview ? `REVIEW_${finishedName}` : finishedName;

    if (result.needsReview) {
      console.warn(`[Queue Worker] ⚠️ Duration mismatch for ${fileMeta.videoFile.name}: ${result.reviewReason}`);
    }

    await uploadFile(localOutputPath, uploadName, ytDateFolderId);

    // ── Watertight Verification ───────────────────────────────
    const uploadVerified = await verifyUploadExists(ytDateFolderId, uploadName);
    if (!uploadVerified) {
      throw new Error(`Upload verification failed: ${uploadName} not found.`);
    }

    // ── 48-Hour Purge ─────────────────────────────────────────
    try {
      const videoPurged = await purgeIfOld(fileMeta.videoFile.id, fileMeta.videoFile.createdTime);
      const audioPurged = await purgeIfOld(fileMeta.audioFile.id, fileMeta.audioFile.createdTime);
      if (videoPurged) console.log(`[Queue Worker] 🗑️ Purged raw video: ${fileMeta.videoFile.name}`);
      if (audioPurged) console.log(`[Queue Worker] 🗑️ Purged raw audio: ${fileMeta.audioFile.name}`);
    } catch (purgeErr) {
      console.warn(`[Queue Worker] Purge warning for ${fileMeta.videoFile.name}:`, purgeErr);
    }

    jobQueueDB.updateJobStatus(job.id, "done", 100);
    console.log(`[Queue Worker] ✅ Finished: ${uploadName}`);
    
    // Check if batch is done and notify Discord
    await checkBatchCompletion(job.batchId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Queue Worker] ❌ Failed: ${fileMeta.videoFile.name} — ${message}`);
    jobQueueDB.setJobError(job.id, message);
  } finally {
    // ── Hard Disk Cleanup ──────────────────────────────────────
    cleanupFile(localVideoPath);
    cleanupFile(localAudioPath);
    cleanupFile(localOutputPath);

    try {
      if (fs.existsSync(tmpDir)) {
        const remaining = fs.readdirSync(tmpDir);
        if (remaining.length === 0) {
          fs.rmdirSync(tmpDir);
        }
      }
    } catch {}
  }
}

async function checkBatchCompletion(batchId: string) {
  const jobs = jobQueueDB.getJobsByBatch(batchId);
  const isDone = jobs.every(j => j.status === 'done' || j.status === 'error' || j.status === 'skipped');
  
  if (isDone) {
    const success = jobs.filter(j => j.status === 'done').length;
    const skipped = jobs.filter(j => j.status === 'skipped').length;
    const errors = jobs.filter(j => j.status === 'error').length;
    
    const summaryMessage = `
✅ **Processed:** ${success} videos
⏭️ **Skipped:** ${skipped} (already in YouTube drive)
❌ **Errors:** ${errors}
    `.trim();
    
    await sendDiscordNotification(`🏭 Batch Complete (${batchId.substring(0, 8)})`, summaryMessage, 0x00FF00);
  }
}

function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}
