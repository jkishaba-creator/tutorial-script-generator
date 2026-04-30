/**
 * GET /api/process-batch/progress?batchId=<id>
 *
 * Server-Sent Events (SSE) endpoint for live batch progress streaming.
 *
 * Sends a JSON event every second with the full batch progress state,
 * including per-video status and FFmpeg render percentages.
 *
 * Example event:
 *   data: {"jobs":[{"jobId":"...","videoName":"tutorial.mp4","status":"processing","renderPercent":45,"batchPosition":"12/80"}],"summary":{"total":80,"done":11,"processing":1,"queued":68,"errors":0,"skipped":0}}
 *
 * The stream closes automatically when all jobs are done/error/skipped,
 * or after 30 minutes (safety timeout).
 */

import { NextRequest } from "next/server";
import { getBatchProgress } from "@/lib/job-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");

  if (!batchId) {
    return new Response(JSON.stringify({ error: "Missing batchId parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const POLL_INTERVAL_MS = 1000;
  const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes safety timeout

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(() => {
        try {
          // Safety timeout
          if (Date.now() - startTime > MAX_DURATION_MS) {
            send({ event: "timeout", message: "Progress stream timed out after 30 minutes" });
            clearInterval(interval);
            controller.close();
            return;
          }

          const jobs = getBatchProgress(batchId);

          if (!jobs) {
            send({ event: "not_found", message: "Batch not found or already cleaned up" });
            clearInterval(interval);
            controller.close();
            return;
          }

          // Build summary
          const summary = {
            total: jobs.length,
            done: jobs.filter((j) => j.status === "done").length,
            processing: jobs.filter((j) => j.status === "processing").length,
            downloading: jobs.filter((j) => j.status === "downloading").length,
            uploading: jobs.filter((j) => j.status === "uploading").length,
            queued: jobs.filter((j) => j.status === "queued").length,
            errors: jobs.filter((j) => j.status === "error").length,
            skipped: jobs.filter((j) => j.status === "skipped").length,
          };

          // Find the currently active job for a headline
          const activeJob = jobs.find(
            (j) => j.status === "processing" || j.status === "downloading" || j.status === "uploading"
          );

          send({
            event: "progress",
            jobs,
            summary,
            activeJob: activeJob
              ? `Rendering Video ${activeJob.batchPosition} - ${activeJob.renderPercent}%`
              : summary.queued > 0
              ? "Waiting in queue..."
              : "Batch complete",
          });

          // Auto-close when everything is terminal
          const allTerminal = jobs.every(
            (j) => j.status === "done" || j.status === "error" || j.status === "skipped"
          );
          if (allTerminal) {
            send({ event: "complete", message: "All jobs finished", summary });
            clearInterval(interval);
            controller.close();
          }
        } catch (err) {
          console.error("SSE progress error:", err);
          clearInterval(interval);
          controller.close();
        }
      }, POLL_INTERVAL_MS);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
