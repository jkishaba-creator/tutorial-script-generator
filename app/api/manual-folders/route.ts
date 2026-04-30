import { NextResponse } from "next/server";
import { folderQueue, KVFolder } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const folders = await folderQueue.getFolders();
    const manualFolders = folders.filter((f: KVFolder) => f.type === "manual");
    
    // Sort so most recently added is at the top
    manualFolders.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    return NextResponse.json({ folders: manualFolders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch manual folders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
