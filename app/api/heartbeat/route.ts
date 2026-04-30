import { NextResponse } from "next/server";
import { jobQueueDB } from "@/lib/job-queue-db";
import { sendDiscordNotification } from "@/lib/discord-webhook";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const jobs = jobQueueDB.getAllJobs();
    
    const pending = jobs.filter(j => j.status === "pending").length;
    const processing = jobs.filter(j => j.status === "processing" || j.status === "downloading" || j.status === "uploading").length;
    const doneToday = jobs.filter(j => j.status === "done" && new Date(j.completedAt || "").getTime() > Date.now() - 24 * 60 * 60 * 1000).length;
    const errors = jobs.filter(j => j.status === "error").length;

    const message = `
🏥 **Queue Health Report**
- **Pending:** ${pending} videos
- **Active:** ${processing} jobs
- **Completed (24h):** ${doneToday}
- **Errors:** ${errors}
    `.trim();

    await sendDiscordNotification("☕ Morning Heartbeat", message, 0x00A2FF);

    return NextResponse.json({ success: true, message });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
