import { NextRequest, NextResponse } from "next/server";
import { folderQueue } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId");

    if (!folderId) {
      return NextResponse.json({ error: "Missing folderId parameter" }, { status: 400 });
    }

    const folder = await folderQueue.getFolder(folderId);
    return NextResponse.json({ folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch folder status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
