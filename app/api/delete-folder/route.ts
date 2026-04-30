import { NextRequest, NextResponse } from "next/server";
import { folderQueue } from "@/lib/job-queue-kv";

export async function POST(req: NextRequest) {
  try {
    const { folderId } = await req.json();
    if (!folderId) {
      return NextResponse.json({ error: "Missing folderId" }, { status: 400 });
    }

    await folderQueue.removeFolder(folderId);
    
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete folder";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
