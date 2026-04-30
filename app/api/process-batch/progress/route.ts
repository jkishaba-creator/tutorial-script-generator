/**
 * GET /api/process-batch/progress?batchId=<id>
 *
 * Simple JSON polling endpoint for batch progress.
 * Replaces the previous SSE (Server-Sent Events) approach, which doesn't work
 * reliably on Vercel serverless functions due to the 10-60s connection timeout.
 *
 * The frontend polls this every 4 seconds. Each call reads from Vercel KV.
 * At ~15 req/min per VA browser tab, we stay well within KV rate limits.
 *
 * Response:
 * {
 *   jobs: JobProgress[],
 *   summary: { total, done, processing, queued, errors, skipped },
 *   activeJob: "Rendering Video 3/80 - 45%",
 *   isComplete: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { kvQueue } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");

  if (!batchId) {
    return NextResponse.json({ error: "Missing batchId parameter" }, { status: 400 });
  }

  try {
    const dbJobs = await kvQueue.getBatchJobs(batchId);

    if (!dbJobs || dbJobs.length === 0) {
      return NextResponse.json({
        found: false,
        message: "Batch not found. It may still be queuing (iMac is crawling Drive), or it may have been pruned.",
        jobs: [],
        summary: { total: 0, done: 0, processing: 0, queued: 0, errors: 0, skipped: 0 },
        isComplete: false,
      });
    }

    // Map to frontend-friendly format
    const jobs = dbJobs.map((j, i) => ({
      jobId: j.id,
      videoName: j.videoName,
      status: j.status === "pending" ? "queued" : j.status,
      renderPercent: j.renderPercent,
      error: j.errorMessage || undefined,
      skipReason: j.skipReason || undefined,
      batchPosition: `${i + 1}/${dbJobs.length}`,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
    }));

    const summary = {
      total: jobs.length,
      done: jobs.filter((j) => j.status === "done").length,
      processing: jobs.filter((j) => j.status === "processing" || j.status === "downloading" || j.status === "uploading").length,
      queued: jobs.filter((j) => j.status === "queued").length,
      errors: jobs.filter((j) => j.status === "error").length,
      skipped: jobs.filter((j) => j.status === "skipped").length,
    };

    const activeJob = jobs.find(
      (j) => j.status === "processing" || j.status === "downloading" || j.status === "uploading"
    );

    const isComplete = jobs.every(
      (j) => j.status === "done" || j.status === "error" || j.status === "skipped"
    );

    let statusLine: string;
    if (activeJob) {
      const action =
        activeJob.status === "downloading" ? "⬇️ Downloading" :
        activeJob.status === "uploading" ? "⬆️ Uploading" :
        `🎬 Rendering ${activeJob.renderPercent}%`;
      statusLine = `${action} — Video ${activeJob.batchPosition}`;
    } else if (summary.queued > 0) {
      statusLine = `⏳ ${summary.queued} video(s) waiting in queue...`;
    } else if (isComplete) {
      statusLine = `✅ Batch complete — ${summary.done} processed, ${summary.errors} errors`;
    } else {
      statusLine = "📡 Waiting for iMac to pick up jobs...";
    }

    return NextResponse.json({
      found: true,
      jobs,
      summary,
      statusLine,
      isComplete,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
