import { getSheetsClient } from "./drive-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoSheetData {
  title: string;
  thumbnailText: string;
  chapters: string;
  description: string;
  tags: string;
}

// ---------------------------------------------------------------------------
// Tab Management
// ---------------------------------------------------------------------------

/**
 * Ensure a tab (sheet) exists in the spreadsheet. If it doesn't exist,
 * create it and add a header row. Returns the sheet ID.
 */
export async function ensureTabExists(
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  const sheets = getSheetsClient();

  // Check if the tab already exists
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const existingSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );

  if (existingSheet) {
    console.log(`[sheets] Tab "${tabName}" already exists (sheetId: ${existingSheet.properties?.sheetId})`);
    return existingSheet.properties?.sheetId ?? 0;
  }

  // Create the tab
  const addSheetResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
            },
          },
        },
      ],
    },
  });

  const newSheetId =
    addSheetResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  console.log(`[sheets] Created tab "${tabName}" (sheetId: ${newSheetId})`);

  // Add header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:C1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["Title", "Thumbnail Text", "Content"]],
    },
  });

  // Bold the header row and set column widths
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold header
        {
          repeatCell: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
              },
            },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        // Column A width (Title) — 400px
        {
          updateDimensionProperties: {
            range: {
              sheetId: newSheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 1,
            },
            properties: { pixelSize: 400 },
            fields: "pixelSize",
          },
        },
        // Column B width (Thumbnail Text) — 250px
        {
          updateDimensionProperties: {
            range: {
              sheetId: newSheetId,
              dimension: "COLUMNS",
              startIndex: 1,
              endIndex: 2,
            },
            properties: { pixelSize: 250 },
            fields: "pixelSize",
          },
        },
        // Column C width (Content) — 600px
        {
          updateDimensionProperties: {
            range: {
              sheetId: newSheetId,
              dimension: "COLUMNS",
              startIndex: 2,
              endIndex: 3,
            },
            properties: { pixelSize: 600 },
            fields: "pixelSize",
          },
        },
      ],
    },
  });

  console.log(`[sheets] Header row and formatting applied to "${tabName}"`);
  return newSheetId;
}

// ---------------------------------------------------------------------------
// Write Video Data
// ---------------------------------------------------------------------------

/**
 * Write one video's metadata to a specific row in the spreadsheet.
 * Row index is 0-based from the data perspective (row 0 = A2 in the sheet,
 * since A1 is the header).
 *
 * Col A: Reformatted Title
 * Col B: Thumbnail Text
 * Col C: Combined — Title \n\n Chapters \n\n Description \n\n Tags
 */
export async function writeVideoMetadata(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  data: VideoSheetData
): Promise<void> {
  const sheets = getSheetsClient();

  // Build the combined Column C content
  // Assembled in the YouTube-ready format:
  // Title → Chapters → Description summary + Hashtags → Tags
  const combinedContent = [
    data.title,
    "",
    data.chapters,
    "",
    data.description,
    "",
    data.tags,
  ].join("\n");

  // rowIndex 0 maps to sheet row 2 (row 1 is header)
  const sheetRow = rowIndex + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A${sheetRow}:C${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[data.title, data.thumbnailText, combinedContent]],
    },
  });

  console.log(`[sheets] Wrote row ${sheetRow} for "${data.title}" in tab "${tabName}"`);
}

// ---------------------------------------------------------------------------
// Batch Write — Ava UI Folder Export
// ---------------------------------------------------------------------------

/**
 * Write an entire folder's worth of video metadata to a Google Sheet tab.
 * This is an atomic batch write — all rows or none.
 *
 * Row 1: Folder link header
 * Row 2: Column headers
 * Row 3+: Data rows (sorted alphabetically by filename)
 */
export async function writeFolderBatch(
  spreadsheetId: string,
  tabName: string,
  folderLink: string,
  videos: { filename: string; title: string | null; thumbnailText: string | null; chapters: string | null; description: string | null; tags: string | null }[]
): Promise<void> {
  const sheets = getSheetsClient();

  // Sort videos alphabetically by filename
  const sorted = [...videos].sort((a, b) => a.filename.localeCompare(b.filename));

  // Check if the tab already exists
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const existingSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );

  let sheetId: number;

  if (existingSheet) {
    sheetId = existingSheet.properties?.sheetId ?? 0;
    console.log(`[sheets] Tab "${tabName}" already exists — overwriting data.`);
  } else {
    // Create the tab
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tabName,
              },
            },
          },
        ],
      },
    });
    sheetId = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    console.log(`[sheets] Created tab "${tabName}" (sheetId: ${sheetId})`);
  }

  // Build rows
  const headerRow = ["📁 YouTube Drive Folder", folderLink ? `=HYPERLINK("${folderLink}", "Open Folder")` : "", ""];
  const columnHeaders = ["Title", "Thumbnail Text", "Combined Text"];
  const dataRows = sorted.map((v) => {
    const parts = [
      v.title || v.filename,
      v.description || "",
      v.chapters || "",
      v.tags ? `Hashtags\n\n${v.tags}` : ""
    ].filter(p => p.trim() !== "");
    
    const combinedContent = parts.join("\n\n");

    return [
      v.title || v.filename,
      v.thumbnailText || "",
      combinedContent,
    ];
  });

  const allRows = [headerRow, columnHeaders, ...dataRows];

  // Write all rows at once
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:C${allRows.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: allRows,
    },
  });

  // Format: bold header row, set column widths
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold folder link row
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        // Bold column headers
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
            fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
          },
        },
        // Column widths
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 600 }, fields: "pixelSize" } },
      ],
    },
  });

  console.log(`[sheets] Wrote ${dataRows.length} rows to "${tabName}" with folder link and formatting.`);
}
