/**
 * POST /api/process-batch
 *
 * Vercel-safe batch trigger. Does NOT crawl Google Drive itself (that would
 * timeout on Vercel's 10s function limit). Instead, it writes a "crawl trigger"
 * to Vercel KV. The iMac queue worker picks this up within 60 seconds, runs
 * the full crawl locally, and populates the job queue.
 *
 * The response is immediate — the VA gets a confirmation right away, and the
 * progress dashboard will show jobs appearing as the iMac crawls and queues them.
 *
 * Request body (all optional):
 * {
 *   "specificDate": "2025-04-23",     // only process this date
 *   "targetFolderId": "abc123..."     // only process this specific date folder
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { crawlTrigger, kvQueue } from "@/lib/job-queue-kv";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const specificDate: string | undefined = body.specificDate;
    const targetFolderId: string | undefined = body.targetFolderId;

    // Validate env vars are accessible (Vercel just needs KV creds — Drive creds are on iMac)
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return NextResponse.json(
        { error: "Missing KV_REST_API_URL or KV_REST_API_TOKEN. Add these in Vercel dashboard." },
        { status: 500 }
      );
    }

    // Write the crawl trigger — iMac picks this up within ~60 seconds
    await crawlTrigger.set({
      requestedAt: new Date().toISOString(),
      specificDate,
      targetFolderId,
      requestedBy: "VA dashboard",
    });

    // Read current queue depth so VA knows what's already queued
    const currentPending = await kvQueue.getPendingCount();

    return NextResponse.json({
      success: true,
      message: specificDate
        ? `📡 Crawl triggered for ${specificDate}. Your iMac will start processing within 60 seconds.`
        : "📡 Full Drive crawl triggered. Your iMac will start processing within 60 seconds.",
      currentQueueDepth: currentPending,
      note: "Jobs will appear in the dashboard as the iMac crawls and queues them.",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-batch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
