import { writeFolderBatch } from "@/lib/sheets-client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { spreadsheetId, tabName, folderLink, videos } = await req.json();

    if (!spreadsheetId || !tabName || !videos || !Array.isArray(videos)) {
      return NextResponse.json(
        { error: "Missing required fields (spreadsheetId, tabName, videos)" },
        { status: 400 }
      );
    }

    await writeFolderBatch(spreadsheetId, tabName, folderLink || "", videos);

    return NextResponse.json({ success: true, message: "Successfully wrote batch to Sheets" });
  } catch (error) {
    console.error("[export-batch-sheets] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to write to Sheets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
