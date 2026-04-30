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
import { crawlUploadsDrive } from "@/lib/drive-crawler";
import { jobQueueDB } from "@/lib/job-queue-db";
import { startQueueWorker } from "@/lib/queue-worker";
import crypto from "crypto";

// Helpers removed (moved to queue-worker.ts)

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

    // ── Generate batch ID and enqueue to SQLite ─────────────────
    const batchId = crypto.randomUUID();

    for (const job of crawlResult.jobs) {
      jobQueueDB.addJob({
        id: crypto.randomUUID(),
        batchId,
        videoName: `${job.producerName}/${job.softwareName}/${job.dateFolder}/${job.videoFile.name}`,
        fileMetaJson: JSON.stringify(job),
      });
    }

    // ── Kick off the background worker ────────────────────────────
    // It runs asynchronously without blocking the response
    startQueueWorker().catch(console.error);

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
