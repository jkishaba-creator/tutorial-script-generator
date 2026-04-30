/**
 * GET /api/debug-seed
 *
 * Seeds Vercel KV with dummy folder data at every lifecycle stage.
 * Used to test the Ava UI without needing real Google Drive files.
 *
 * Hit this once: curl http://localhost:3002/api/debug-seed
 * Then open the Ava tab — you'll see 6 folders, one per stage.
 *
 * ⚠️ DEBUG ONLY — remove before production.
 */

import { NextResponse } from "next/server";
import { folderQueue, KVFolder, kvQueue } from "@/lib/job-queue-kv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date().toISOString();

    const testFolders: KVFolder[] = [
      {
        folderId: "test-raw-001",
        path: "Eli/Cursor/2025-04-30",
        producer: "Eli",
        software: "Cursor",
        date: "2025-04-30",
        stage: "raw",
        batchId: null,
        videoCount: 5,
        ytFolderId: null,
        ytFolderLink: null,
        sheetTabName: null,
        addedAt: now,
        renderedAt: null,
        exportedAt: null,
        doneAt: null,
        videoResults: null,
      },
      {
        folderId: "test-ready-002",
        path: "Ar/Figma/2025-04-29",
        producer: "Ar",
        software: "Figma",
        date: "2025-04-29",
        stage: "ready",
        batchId: null,
        videoCount: 3,
        ytFolderId: null,
        ytFolderLink: null,
        sheetTabName: null,
        addedAt: now,
        renderedAt: null,
        exportedAt: null,
        doneAt: null,
        videoResults: null,
      },
      {
        folderId: "test-rendering-003",
        path: "Shara/Canva/2025-04-28",
        producer: "Shara",
        software: "Canva",
        date: "2025-04-28",
        stage: "rendering",
        batchId: "batch-test-003",
        videoCount: 8,
        ytFolderId: null,
        ytFolderLink: null,
        sheetTabName: null,
        addedAt: now,
        renderedAt: null,
        exportedAt: null,
        doneAt: null,
        videoResults: null,
      },
      {
        folderId: "test-rendered-004",
        path: "Paula/Cursor/2025-04-27",
        producer: "Paula",
        software: "Cursor",
        date: "2025-04-27",
        stage: "rendered",
        batchId: "batch-test-004",
        videoCount: 4,
        ytFolderId: "yt-folder-fake-004",
        ytFolderLink: "https://drive.google.com/drive/folders/fake-yt-004",
        sheetTabName: null,
        addedAt: now,
        renderedAt: now,
        exportedAt: null,
        doneAt: null,
        videoResults: [
          { filename: "ai-basics_Paula_FINISHED.mp4", driveFileId: "f1", title: null, thumbnailText: null, chapters: null, description: null, tags: null, metadataStatus: "pending", metadataError: null },
          { filename: "cursor-tips_Paula_FINISHED.mp4", driveFileId: "f2", title: null, thumbnailText: null, chapters: null, description: null, tags: null, metadataStatus: "pending", metadataError: null },
          { filename: "prompt-engineering_Paula_FINISHED.mp4", driveFileId: "f3", title: null, thumbnailText: null, chapters: null, description: null, tags: null, metadataStatus: "pending", metadataError: null },
          { filename: "workflow-automation_Paula_FINISHED.mp4", driveFileId: "f4", title: null, thumbnailText: null, chapters: null, description: null, tags: null, metadataStatus: "pending", metadataError: null },
        ],
      },
      {
        folderId: "test-exported-005",
        path: "Mardz/Figma/2025-04-26",
        producer: "Mardz",
        software: "Figma",
        date: "2025-04-26",
        stage: "exported",
        batchId: "batch-test-005",
        videoCount: 6,
        ytFolderId: "yt-folder-fake-005",
        ytFolderLink: "https://drive.google.com/drive/folders/fake-yt-005",
        sheetTabName: "Figma — 2025-04-26",
        addedAt: now,
        renderedAt: now,
        exportedAt: now,
        doneAt: null,
        videoResults: [
          { filename: "auto-layout_Mardz_FINISHED.mp4", driveFileId: "m1", title: "Figma Auto Layout Masterclass", thumbnailText: "Auto Layout in 10 Min", chapters: "0:00 Intro\n0:30 Setup\n2:15 Basic Layout\n5:00 Advanced Nesting", description: "Learn Figma auto layout...", tags: "figma,auto-layout,design", metadataStatus: "done", metadataError: null },
          { filename: "components_Mardz_FINISHED.mp4", driveFileId: "m2", title: "Figma Components Deep Dive", thumbnailText: "Components 101", chapters: "0:00 Intro\n1:00 Creating Components\n3:30 Variants", description: "Master Figma components...", tags: "figma,components,ui", metadataStatus: "done", metadataError: null },
          { filename: "constraints_Mardz_FINISHED.mp4", driveFileId: "m3", title: "Figma Constraints Explained", thumbnailText: "Constraints Made Easy", chapters: "0:00 Intro\n0:45 Basics", description: "Understanding constraints...", tags: "figma,constraints", metadataStatus: "done", metadataError: null },
          { filename: "prototyping_Mardz_FINISHED.mp4", driveFileId: "m4", title: "Prototyping in Figma", thumbnailText: "Prototype Like a Pro", chapters: "0:00 Intro\n1:30 Flows", description: "Build interactive prototypes...", tags: "figma,prototype", metadataStatus: "done", metadataError: null },
          { filename: "styles_Mardz_FINISHED.mp4", driveFileId: "m5", title: "Figma Styles System", thumbnailText: "Design Tokens", chapters: "0:00 Intro\n0:30 Colors", description: "Create a scalable style system...", tags: "figma,styles,tokens", metadataStatus: "done", metadataError: null },
          { filename: "variables_Mardz_FINISHED.mp4", driveFileId: "m6", title: "Figma Variables Tutorial", thumbnailText: "Variables Deep Dive", chapters: "0:00 Intro\n2:00 Setup", description: "Master Figma variables...", tags: "figma,variables", metadataStatus: "done", metadataError: null },
        ],
      },
      {
        folderId: "test-done-006",
        path: "Eli/Canva/2025-04-25",
        producer: "Eli",
        software: "Canva",
        date: "2025-04-25",
        stage: "done",
        batchId: "batch-test-006",
        videoCount: 3,
        ytFolderId: "yt-folder-fake-006",
        ytFolderLink: "https://drive.google.com/drive/folders/fake-yt-006",
        sheetTabName: "Canva — 2025-04-25",
        addedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        renderedAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(),
        exportedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        doneAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        videoResults: [
          { filename: "intro-canva_Eli_FINISHED.mp4", driveFileId: "c1", title: "Canva for Beginners", thumbnailText: "Start Here", chapters: "0:00 Intro", description: "Get started with Canva", tags: "canva,beginner", metadataStatus: "done", metadataError: null },
          { filename: "templates_Eli_FINISHED.mp4", driveFileId: "c2", title: "Canva Templates", thumbnailText: "Templates 101", chapters: "0:00 Intro", description: "Use Canva templates", tags: "canva,templates", metadataStatus: "done", metadataError: null },
          { filename: "branding_Eli_FINISHED.mp4", driveFileId: "c3", title: "Brand Kit in Canva", thumbnailText: "Brand Your Content", chapters: "0:00 Intro", description: "Set up your brand kit", tags: "canva,branding", metadataStatus: "done", metadataError: null },
        ],
      },
    ];

    // Seed fake batch jobs for the "rendering" folder so progress shows up
    const fakeJobStatuses = ["done", "done", "done", "processing", "pending", "pending", "pending", "pending"];
    for (let i = 0; i < fakeJobStatuses.length; i++) {
      const jobId = `test-job-003-${i}`;
      await kvQueue.addJob({
        id: jobId,
        batchId: "batch-test-003",
        videoName: `video${i + 1}_Shara.mp4`,
        fileMetaJson: "{}",
      });
      if (fakeJobStatuses[i] === "done") {
        await kvQueue.updateJob(jobId, { status: "done", renderPercent: 100 });
      } else if (fakeJobStatuses[i] === "processing") {
        await kvQueue.updateJob(jobId, { status: "processing", renderPercent: 45 });
      }
    }

    // Seed all folders
    for (const folder of testFolders) {
      await folderQueue.upsertFolder(folder);
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${testFolders.length} test folders. Open the Ava tab to see them.`,
      folders: testFolders.map((f) => `${f.path} (${f.stage})`),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
