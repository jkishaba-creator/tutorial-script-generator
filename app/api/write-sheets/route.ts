import { ensureTabExists, writeVideoMetadata, VideoSheetData } from "@/lib/sheets-client";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST Handler — Write one video's metadata to Google Sheets
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, tabName, rowIndex, data } = body as {
      spreadsheetId?: string;
      tabName?: string;
      rowIndex?: number;
      data?: VideoSheetData;
    };

    // --- Validate ---
    if (!spreadsheetId || !tabName || rowIndex === undefined || !data) {
      return NextResponse.json(
        { error: "Missing required fields: spreadsheetId, tabName, rowIndex, data" },
        { status: 400 }
      );
    }

    // --- Ensure tab exists (creates with headers if new) ---
    await ensureTabExists(spreadsheetId, tabName);

    // --- Write the row ---
    await writeVideoMetadata(spreadsheetId, tabName, rowIndex, data);

    return NextResponse.json({ success: true, rowIndex });
  } catch (error) {
    console.error("[write-sheets] Error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Failed to write to Google Sheets.";

    return NextResponse.json(
      { error: message, errorCategory: "SHEETS_ERROR" },
      { status: 500 }
    );
  }
}
