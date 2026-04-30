/**
 * POST /api/heartbeat
 *
 * Called by the PM2 cron job every morning at 8:00 AM.
 * Reads the current queue state from Vercel KV and sends a Discord summary.
 * Also used by the VA dashboard to manually trigger a status ping.
 */

import { NextResponse } from "next/server";
import { kvQueue, macHeartbeat } from "@/lib/job-queue-kv";
import { sendDiscordNotification } from "@/lib/discord-webhook";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const [heartbeat, pendingCount] = await Promise.all([
      macHeartbeat.read(),
      kvQueue.getPendingCount(),
    ]);

    const macStatus = heartbeat
      ? `🟢 **Online** (last seen: ${timeAgo(heartbeat.timestamp)})`
      : "🔴 **Offline** (no heartbeat in >10 min)";

    const message = [
      `**iMac Status:** ${macStatus}`,
      `**Queue Depth:** ${pendingCount} videos pending`,
      heartbeat ? `**Processed Today:** ${heartbeat.jobsProcessedToday} videos` : null,
      heartbeat?.currentJob ? `**Current Job:** \`${heartbeat.currentJob}\`` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await sendDiscordNotification("☕ Morning Heartbeat", message, heartbeat ? 0x00A2FF : 0xFF4444);

    return NextResponse.json({ success: true, message });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
