import { NextRequest, NextResponse } from "next/server";
import { folderQueue, KVFolder, VideoResult } from "@/lib/job-queue-kv";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { folderId, folderName, sheetTabName, files } = body;

    if (!folderId || !files || !Array.isArray(files)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existing = await folderQueue.getFolder(folderId);

    if (existing) {
      // Just re-trigger export (worker will skip already done items)
      if (sheetTabName) {
         await folderQueue.updateFolder(folderId, { sheetTabName });
      }
    } else {
      // Create new manual folder
      const videoResults: VideoResult[] = files.map(f => ({
        filename: f.name,
        driveFileId: f.id,
        title: null,
        thumbnailText: null,
        chapters: null,
        description: null,
        tags: null,
        metadataStatus: "pending",
        metadataError: null
      }));

      const newFolder: KVFolder = {
        folderId,
        path: folderName || "Manual Target",
        producer: "Manual",
        software: "Manual",
        date: new Date().toISOString().split('T')[0],
        stage: "rendered", // Starts at rendered so export can pick it up
        batchId: null,
        videoCount: videoResults.length,
        ytFolderId: null,
        ytFolderLink: `https://drive.google.com/drive/folders/${folderId}`,
        sheetTabName: sheetTabName || folderName || "Videos",
        addedAt: new Date().toISOString(),
        renderedAt: new Date().toISOString(),
        exportedAt: null,
        doneAt: null,
        videoResults,
        type: "manual",
      };

      await folderQueue.upsertFolder(newFolder);
    }

    // Push the export action to the iMac worker
    await folderQueue.pushAction({ action: "export", folderId });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to queue export";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
