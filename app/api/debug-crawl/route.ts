/**
 * GET /api/debug-crawl
 *
 * Diagnostic endpoint. Tests Drive access at each level:
 *   1. Can we reach the Uploads Shared Drive root?
 *   2. Can we list producer folders?
 *   3. Can we reach the YouTube Shared Drive root?
 *   4. Can we list its folders?
 *
 * Returns structured results so you can see exactly where access breaks.
 */

import { NextResponse } from "next/server";
import { listFolders, listChildren } from "@/lib/drive-crawler";

export async function GET() {
  const uploadsDriveId = process.env.UPLOADS_DRIVE_ID;
  const youtubeDriveId = process.env.YOUTUBE_DRIVE_ID;

  const result: Record<string, unknown> = {
    env: {
      UPLOADS_DRIVE_ID: uploadsDriveId ? `✅ Set (${uploadsDriveId})` : "❌ NOT SET",
      YOUTUBE_DRIVE_ID: youtubeDriveId ? `✅ Set (${youtubeDriveId})` : "❌ NOT SET",
    },
  };

  // ── Test Uploads Drive ──────────────────────────────────────────
  if (!uploadsDriveId) {
    result.uploads = "❌ Skipped — UPLOADS_DRIVE_ID not set";
  } else {
    try {
      const producers = await listFolders(uploadsDriveId);
      result.uploads = {
        status: "✅ Accessible",
        producerFolders: producers.map((p) => p.name),
        count: producers.length,
      };

      // Drill into each producer to check software > date
      const drilldown: Record<string, unknown> = {};
      for (const producer of producers) {
        try {
          const softwareFolders = await listFolders(producer.id);
          drilldown[producer.name] = {};

          for (const sw of softwareFolders) {
            try {
              const dateFolders = await listFolders(sw.id);
              const details: Record<string, unknown> = {};

              for (const date of dateFolders) {
                const files = await listChildren(date.id);
                details[date.name] = files.map((f) => `${f.name} (${f.mimeType})`);
              }

              (drilldown[producer.name] as Record<string, unknown>)[sw.name] = details;
            } catch (swErr) {
              (drilldown[producer.name] as Record<string, unknown>)[sw.name] =
                `❌ Error: ${swErr instanceof Error ? swErr.message : swErr}`;
            }
          }
        } catch (pErr) {
          drilldown[producer.name] = `❌ Error: ${pErr instanceof Error ? pErr.message : pErr}`;
        }
      }
      result.uploadsHierarchy = drilldown;
    } catch (err) {
      result.uploads = {
        status: "❌ Error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Test YouTube Drive ──────────────────────────────────────────
  if (!youtubeDriveId) {
    result.youtube = "❌ Skipped — YOUTUBE_DRIVE_ID not set";
  } else {
    try {
      const ytFolders = await listFolders(youtubeDriveId);
      result.youtube = {
        status: "✅ Accessible",
        topLevelFolders: ytFolders.map((f) => f.name),
        count: ytFolders.length,
      };
    } catch (err) {
      result.youtube = {
        status: "❌ Error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(result, { status: 200 });
}
