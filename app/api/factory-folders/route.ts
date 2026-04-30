/**
 * GET  /api/factory-folders — List all tracked folders with stage + progress
 * POST /api/factory-folders — Uploader triggers an action (render, export, done)
 *
 * All heavy operations (scan, render, export) write a trigger to KV.
 * The iMac worker picks them up. The API returns immediately (Vercel-safe).
 */

import { NextRequest, NextResponse } from "next/server";
import { folderQueue, KVFolder, kvQueue } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

// ── GET — List all folders ──────────────────────────────────────────

export async function GET() {
  try {
    const folders = await folderQueue.getFolders();

    // Enrich each folder with real-time job progress if it has a batchId
    const enriched = await Promise.all(
      folders.map(async (f: KVFolder) => {
        if (f.batchId && (f.stage === "rendering" || f.stage === "rendered")) {
          const jobs = await kvQueue.getBatchJobs(f.batchId);
          const progress = {
            total: jobs.length,
            done: jobs.filter((j) => j.status === "done").length,
            processing: jobs.filter((j) =>
              ["downloading", "processing", "uploading"].includes(j.status)
            ).length,
            queued: jobs.filter((j) => j.status === "pending").length,
            errors: jobs.filter((j) => j.status === "error").length,
            skipped: jobs.filter((j) => j.status === "skipped").length,
          };

          // Auto-advance from rendering → rendered when all jobs are terminal
          if (
            f.stage === "rendering" &&
            progress.total > 0 &&
            progress.queued === 0 &&
            progress.processing === 0
          ) {
            await folderQueue.updateFolder(f.folderId, {
              stage: "rendered",
              renderedAt: new Date().toISOString(),
            });
            f.stage = "rendered";
          }

          return { ...f, progress };
        }
        return { ...f, progress: null };
      })
    );

    return NextResponse.json({ folders: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — Uploader action ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, folderId } = body as {
      action: "scan" | "render" | "export" | "done";
      folderId?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing 'action' field" }, { status: 400 });
    }

    switch (action) {
      case "scan": {
        // Push scan trigger — iMac will crawl Drive and discover folders
        await folderQueue.pushAction({ action: "scan" });
        return NextResponse.json({
          success: true,
          message: "📡 Scan trigger sent. iMac will discover new folders within 60 seconds.",
        });
      }

      case "render": {
        if (!folderId) {
          return NextResponse.json({ error: "Missing 'folderId' for render action" }, { status: 400 });
        }
        const folder = await folderQueue.getFolder(folderId);
        if (!folder) {
          return NextResponse.json({ error: "Folder not found in tracking" }, { status: 404 });
        }
        if (folder.stage !== "ready" && folder.stage !== "raw") {
          return NextResponse.json({
            error: `Folder is in '${folder.stage}' stage. Can only render 'raw' or 'ready' folders.`,
          }, { status: 400 });
        }

        await folderQueue.updateFolder(folderId, { stage: "rendering" });
        await folderQueue.pushAction({ action: "render", folderId });

        return NextResponse.json({
          success: true,
          message: `▶ Render triggered for ${folder.path}. iMac will pick this up within 60 seconds.`,
        });
      }

      case "export": {
        if (!folderId) {
          return NextResponse.json({ error: "Missing 'folderId' for export action" }, { status: 400 });
        }
        const folder = await folderQueue.getFolder(folderId);
        if (!folder) {
          return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }
        if (folder.stage !== "rendered") {
          return NextResponse.json({
            error: `Folder is in '${folder.stage}' stage. Can only export 'rendered' folders.`,
          }, { status: 400 });
        }

        await folderQueue.pushAction({ action: "export", folderId });

        return NextResponse.json({
          success: true,
          message: `📝 Metadata generation + Sheet export triggered for ${folder.path}.`,
        });
      }

      case "done": {
        if (!folderId) {
          return NextResponse.json({ error: "Missing 'folderId'" }, { status: 400 });
        }
        const folder = await folderQueue.getFolder(folderId);
        if (!folder) {
          return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }

        await folderQueue.updateFolder(folderId, {
          stage: "done",
          doneAt: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: `☑️ ${folder.path} marked as done. Raw files are now eligible for cleanup.`,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
