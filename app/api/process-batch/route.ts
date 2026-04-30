/**
 * POST /api/process-batch
 *
 * Conveyor Belt Crawler — Batch coordinator for the FFmpeg Speed-Sync Engine.
 *
 * Crawls the Uploads Shared Drive hierarchy (Producer > Software > Date),
 * processes all unfinished 2x videos, and routes the 1x renders to the
 * YouTube Shared Drive (Software > Date > Producer_filename_FINISHED.mp4).
 *
 * Request body (all optional):
 * {
 *   "specificDate": "2025-04-23",     // only process this date
 *   "targetFolderId": "abc123..."     // only process this specific date folder
 * }
 *
 * If neither is provided, crawls ALL producers × ALL software × ALL dates.
 *
 * Flow per video:
 *   1. Smart Skip — check YouTube/Software/Date/ for Producer_filename_FINISHED.mp4
 *   2. Download 2x video + audio to /tmp
 *   3. FFmpeg render (2x→1x, overlay audio, h264_videotoolbox)
 *   4. Upload to YouTube/Software/Date/ (with REVIEW_ prefix if duration mismatch)
 *   5. Verify upload landed in YouTube Drive (watertight check)
 *   6. 48-hour purge: delete raw files from Uploads if older than 48h
 *   7. Cleanup local /tmp files
 *
 * All jobs run through the global p-queue (concurrency = 1).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  crawlUploadsDrive,
  ensureYouTubePath,
  downloadFile,
  uploadFile,
  verifyUploadExists,
  purgeIfOld,
  buildFinishedFilename,
} from "@/lib/drive-crawler";
import { processVideo } from "@/lib/video-processor";

import {
  getQueue,
  initBatchProgress,
  updateJobProgress,
  cleanupBatchProgress,
  type JobProgress,
} from "@/lib/job-queue";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Safely delete a local file if it exists.
 */
function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up: ${filePath}`);
    }
  } catch (err) {
    console.warn(`Failed to cleanup ${filePath}:`, err);
  }
}

// ── Route Handler ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const specificDate: string | undefined = body.specificDate;
    const targetFolderId: string | undefined = body.targetFolderId;

    // Read Shared Drive IDs from environment
    const uploadsDriveId = process.env.UPLOADS_DRIVE_ID;
    const youtubeDriveId = process.env.YOUTUBE_DRIVE_ID;

    if (!uploadsDriveId || !youtubeDriveId) {
      return NextResponse.json(
        { error: "Missing environment variables: UPLOADS_DRIVE_ID and/or YOUTUBE_DRIVE_ID" },
        { status: 500 }
      );
    }

    // ── Crawl the Uploads Drive ───────────────────────────────────
    console.log("Starting Conveyor Belt Crawler...");
    if (specificDate) console.log(`Filtering to date: ${specificDate}`);
    if (targetFolderId) console.log(`Filtering to folder: ${targetFolderId}`);

    const crawlResult = await crawlUploadsDrive(
      uploadsDriveId,
      youtubeDriveId,
      specificDate,
      targetFolderId
    );

    if (crawlResult.jobs.length === 0) {
      return NextResponse.json({
        batchId: null,
        totalVideos: 0,
        skipped: crawlResult.skipped,
        errors: crawlResult.errors,
        message: crawlResult.skipped > 0
          ? `All ${crawlResult.skipped} video(s) already processed. Nothing to do.`
          : "No video files found to process.",
      });
    }

    // ── Generate batch ID and initialize progress ─────────────────
    const batchId = crypto.randomUUID();

    const jobProgressList: JobProgress[] = crawlResult.jobs.map((j, i) => ({
      jobId: crypto.randomUUID(),
      videoName: `${j.producerName}/${j.softwareName}/${j.dateFolder}/${j.videoFile.name}`,
      status: "queued" as const,
      renderPercent: 0,
      batchPosition: `${i + 1}/${crawlResult.jobs.length}`,
    }));

    initBatchProgress(batchId, jobProgressList);

    // ── Queue all jobs ────────────────────────────────────────────
    const queue = getQueue();

    for (let i = 0; i < crawlResult.jobs.length; i++) {
      const job = crawlResult.jobs[i];
      const progress = jobProgressList[i];

      queue.add(async () => {
        const finishedName = buildFinishedFilename(job.producerName, job.videoFile.name, job.version);

        // Local temp paths
        const tmpDir = path.join(os.tmpdir(), "nightshift", batchId);
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }

        const localVideoPath = path.join(tmpDir, `raw_${job.videoFile.name}`);
        const localAudioPath = path.join(tmpDir, `raw_${job.audioFile.name}`);
        const localOutputPath = path.join(tmpDir, finishedName);

        try {
          // ── Download ──────────────────────────────────────────────
          updateJobProgress(batchId, progress.jobId, { status: "downloading" });
          console.log(`Downloading: ${job.producerName}/${job.softwareName}/${job.dateFolder}/${job.videoFile.name}`);

          await downloadFile(job.videoFile.id, localVideoPath);
          await downloadFile(job.audioFile.id, localAudioPath);

          // ── FFmpeg Process ────────────────────────────────────────
          updateJobProgress(batchId, progress.jobId, { status: "processing" });
          console.log(`Processing: ${finishedName}`);

          const result = await processVideo({
            inputVideoPath: localVideoPath,
            inputAudioPath: localAudioPath,
            outputPath: localOutputPath,
            onProgress: (percent) => {
              updateJobProgress(batchId, progress.jobId, { renderPercent: percent });
            },
          });

          // ── Upload to YouTube Drive ───────────────────────────────
          updateJobProgress(batchId, progress.jobId, { status: "uploading" });

          // Ensure YouTube/Software/Date/ path exists
          const ytDateFolderId = await ensureYouTubePath(
            youtubeDriveId,
            job.softwareName,
            job.dateFolder
          );

          // Use REVIEW_ prefix if duration mismatch detected
          const uploadName = result.needsReview
            ? `REVIEW_${finishedName}`
            : finishedName;

          if (result.needsReview) {
            console.warn(`⚠️ Duration mismatch for ${job.videoFile.name}: ${result.reviewReason}`);
          }

          await uploadFile(localOutputPath, uploadName, ytDateFolderId);

          // ── Watertight Verification ───────────────────────────────
          // Re-query Drive to confirm the upload actually landed
          const uploadVerified = await verifyUploadExists(ytDateFolderId, uploadName);

          if (!uploadVerified) {
            throw new Error(
              `Upload verification failed: ${uploadName} not found in YouTube/${job.softwareName}/${job.dateFolder}/`
            );
          }

          console.log(`✅ Verified: ${uploadName} in YouTube/${job.softwareName}/${job.dateFolder}/`);


          // ── 48-Hour Purge ─────────────────────────────────────────
          // Only purge AFTER watertight verification
          try {
            const videoPurged = await purgeIfOld(job.videoFile.id, job.videoFile.createdTime);
            const audioPurged = await purgeIfOld(job.audioFile.id, job.audioFile.createdTime);
            if (videoPurged) console.log(`🗑️ Purged raw video: ${job.videoFile.name}`);
            if (audioPurged) console.log(`🗑️ Purged raw audio: ${job.audioFile.name}`);
          } catch (purgeErr) {
            // Purge failure should not fail the job
            console.warn(`Purge warning for ${job.videoFile.name}:`, purgeErr);
          }

          updateJobProgress(batchId, progress.jobId, {
            status: "done",
            renderPercent: 100,
          });

          console.log(`✅ Finished: ${uploadName}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`❌ Failed: ${job.videoFile.name} — ${message}`);
          updateJobProgress(batchId, progress.jobId, {
            status: "error",
            error: message,
          });
        } finally {
          // ── Hard Disk Cleanup ──────────────────────────────────────
          cleanupFile(localVideoPath);
          cleanupFile(localAudioPath);
          cleanupFile(localOutputPath);

          // Remove temp dir if empty
          try {
            const remaining = fs.readdirSync(tmpDir);
            if (remaining.length === 0) {
              fs.rmdirSync(tmpDir);
            }
          } catch {
            // ignore
          }
        }
      });
    }

    // Schedule progress cleanup when batch completes
    queue.onIdle().then(async () => {
      console.log(`Batch ${batchId} complete.`);
      cleanupBatchProgress(batchId);

      // Send Discord summary
      const { sendDiscordNotification } = await import("@/lib/discord-webhook");
      const summaryMessage = `
✅ **Processed:** ${crawlResult.jobs.length} videos
⏭️ **Skipped:** ${crawlResult.skipped} (already in YouTube drive)
❌ **Errors:** ${crawlResult.errors.length}
      `.trim();
      
      await sendDiscordNotification("🏭 Night Shift Complete", summaryMessage, 0x00FF00);
    });

    return NextResponse.json({
      batchId,
      totalVideos: crawlResult.jobs.length,
      skipped: crawlResult.skipped,
      crawlErrors: crawlResult.errors,
      message: `Conveyor Belt running. ${crawlResult.jobs.length} video(s) queued, ${crawlResult.skipped} skipped.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Conveyor Belt error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
