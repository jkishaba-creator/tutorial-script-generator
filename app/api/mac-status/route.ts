/**
 * GET /api/mac-status
 *
 * Returns the current online/offline status of the iMac queue worker.
 * The iMac writes a heartbeat to Vercel KV every 5 minutes with a 10-minute TTL.
 * If the key is expired, the iMac has been offline for >10 minutes.
 *
 * Response:
 * {
 *   online: boolean,
 *   status: "online" | "idle" | "offline",
 *   lastSeen: "2 min ago" | "14 hours ago" | null,
 *   currentJob: "Eli/Canva/2025-04-30/tutorial.mp4" | null,
 *   jobsProcessedToday: number,
 *   queueDepth: number,
 *   hasPendingCrawl: boolean
 * }
 */

import { NextResponse } from "next/server";
import { macHeartbeat, crawlTrigger, kvQueue } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export async function GET() {
  try {
    const [heartbeat, pendingCrawl, queueDepth] = await Promise.all([
      macHeartbeat.read(),
      crawlTrigger.peek(),
      kvQueue.getPendingCount(),
    ]);

    if (!heartbeat) {
      return NextResponse.json({
        online: false,
        status: "offline",
        lastSeen: null,
        currentJob: null,
        jobsProcessedToday: 0,
        queueDepth,
        hasPendingCrawl: !!pendingCrawl,
      });
    }

    const lastSeen = timeAgo(heartbeat.timestamp);
    const isProcessing = heartbeat.status === "processing";

    return NextResponse.json({
      online: true,
      status: isProcessing ? "processing" : "idle",
      lastSeen,
      currentJob: heartbeat.currentJob || null,
      jobsProcessedToday: heartbeat.jobsProcessedToday,
      queueDepth: heartbeat.queueDepth ?? queueDepth,
      hasPendingCrawl: !!pendingCrawl,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, online: false, status: "offline" }, { status: 500 });
  }
}
