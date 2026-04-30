/**
 * POST /api/drive-files-metadata
 *
 * Lightweight preflight endpoint for the Batch IDs feature.
 *
 * Accepts an array of up to 20 Google Drive file IDs and returns their
 * metadata (name, mimeType) sorted alphabetically by filename to enforce
 * the "Golden Rule" before any Gemini processing begins.
 *
 * Invalid or inaccessible IDs are returned inline with an error flag
 * instead of failing the whole request — the frontend will mark those
 * rows as DRIVE_NOT_FOUND immediately without stopping the batch.
 *
 * Request body:
 * { "fileIds": ["id1", "id2", ...] }   // max 20 IDs
 *
 * Response:
 * {
 *   "files": [
 *     { "id": "id1", "name": "Tutorial 01.mp4", "mimeType": "video/mp4" },
 *     { "id": "id2", "name": null, "error": "DRIVE_NOT_FOUND" },
 *     ...
 *   ]
 * }
 *
 * Files are sorted A→Z by name. Error entries (no name) are appended after
 * the sorted valid entries.
 */

import { getDriveClient } from "@/lib/drive-client";
import { NextRequest, NextResponse } from "next/server";

const MAX_IDS = 20;

interface FileMetadataResult {
  id: string;
  name: string | null;
  mimeType: string | null;
  error?: string;
  errorCategory?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds } = body as { fileIds?: unknown };

    // ── Validate input ──────────────────────────────────────────────
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: fileIds (must be a non-empty array)" },
        { status: 400 }
      );
    }

    // Cast and sanitize
    const ids: string[] = fileIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid file IDs provided after sanitization" },
        { status: 400 }
      );
    }

    // ── Fetch metadata for each ID ──────────────────────────────────
    const drive = getDriveClient();
    const results: FileMetadataResult[] = [];

    for (const id of ids) {
      try {
        const meta = await drive.files.get({
          fileId: id,
          fields: "id, name, mimeType",
          supportsAllDrives: true,
        });

        results.push({
          id,
          name: meta.data.name ?? null,
          mimeType: meta.data.mimeType ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        let errorCategory = "UNKNOWN";
        if (message.includes("404") || message.includes("not found")) {
          errorCategory = "DRIVE_NOT_FOUND";
        } else if (message.includes("403") || message.includes("Permission")) {
          errorCategory = "DRIVE_PERMISSION";
        }

        results.push({
          id,
          name: null,
          mimeType: null,
          error: message,
          errorCategory,
        });
      }
    }

    // ── Sort: valid files A→Z by name, errors appended after ────────
    const validFiles = results
      .filter((f) => f.name !== null)
      .sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

    const errorFiles = results.filter((f) => f.name === null);

    return NextResponse.json({ files: [...validFiles, ...errorFiles] });
  } catch (error) {
    console.error("[drive-files-metadata] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch file metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
