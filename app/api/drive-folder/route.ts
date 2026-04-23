import { getDriveClient } from "@/lib/drive-client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  if (!folderId || !folderId.trim()) {
    return NextResponse.json({ error: "Missing folderId parameter" }, { status: 400 });
  }

  try {
    const drive = getDriveClient();

    // Verify it's actually a folder first (friendly error)
    const folderMeta = await drive.files.get({
      fileId: folderId,
      fields: "mimeType, name",
      supportsAllDrives: true,
    });

    if (folderMeta.data.mimeType !== "application/vnd.google-apps.folder") {
      return NextResponse.json(
        { error: "The provided ID is not a Google Drive folder." },
        { status: 400 }
      );
    }

    // List all videos inside the folder
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/'`,
      fields: "files(id, name, mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
    });

    const files = res.data.files || [];

    // Sort alphabetically by name (A to Z) to respect the "Golden Rule"
    files.sort((a, b) => {
      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return NextResponse.json({ 
      files,
      folderName: folderMeta.data.name || "Unknown Folder"
    });
  } catch (error) {
    console.error("[drive-folder] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch folder contents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
