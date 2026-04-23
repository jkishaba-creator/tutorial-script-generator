import { prepareVideoForGemini, generateFromGeminiFile } from "@/lib/gemini-pipeline";
import { buildChapterPrompt, cleanChapterOutput } from "@/lib/prompts/chapters";
import { buildMetadataPrompt, parseMetadataResponse } from "@/lib/prompts/metadata";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST Handler — Dual-Prompt: Chapters + Metadata
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { driveFileId, videoTitle } = body as {
      driveFileId?: string;
      videoTitle?: string;
    };

    // --- Validate input ---
    if (!driveFileId || typeof driveFileId !== "string" || !driveFileId.trim()) {
      return NextResponse.json(
        { error: "Missing required field: driveFileId" },
        { status: 400 }
      );
    }

    // --- Step 1: Upload video once, get active file reference ---
    const { activeFile, fileName } = await prepareVideoForGemini(driveFileId.trim());

    const titleForPrompts = videoTitle?.trim() || fileName.replace(/\.[^/.]+$/, "");

    // --- Step 2: Run chapters prompt ---
    console.log(`[chapters] Generating chapters...`);
    const chapterPrompt = buildChapterPrompt(titleForPrompts);
    const rawChapters = await generateFromGeminiFile(activeFile, chapterPrompt);
    const chapters = cleanChapterOutput(rawChapters);

    if (!chapters.trim()) {
      return NextResponse.json(
        { error: "Gemini returned no valid chapters. The video may be too short or unclear." },
        { status: 422 }
      );
    }

    // --- Step 3: Run metadata prompt ---
    console.log(`[chapters] Generating metadata...`);
    const metadataPrompt = buildMetadataPrompt(titleForPrompts);
    const rawMetadata = await generateFromGeminiFile(activeFile, metadataPrompt);
    const metadata = parseMetadataResponse(rawMetadata);

    console.log(`[chapters] Done — ${chapters.split("\n").length} chapters + metadata package`);

    return NextResponse.json({
      chapters,
      fileName,
      title: metadata.title,
      thumbnailText: metadata.thumbnailText,
      tags: metadata.tags,
      description: metadata.description,
    });
  } catch (error) {
    console.error("[chapters] Error:", error);

    // Surface a readable message
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate chapters. Please check your API keys and Drive file ID.";

    // Detect specific failure modes for error categorization
    let status = 500;
    let errorCategory = "INTERNAL";

    if (message.includes("not configured") || message.includes("not valid JSON")) {
      status = 500;
      errorCategory = "CONFIG";
    } else if (message.includes("not found") || message.includes("404")) {
      status = 404;
      errorCategory = "DRIVE_NOT_FOUND";
    } else if (message.includes("Permission") || message.includes("403")) {
      status = 403;
      errorCategory = "DRIVE_PERMISSION";
    } else if (message.includes("Safety") || message.includes("SAFETY")) {
      status = 422;
      errorCategory = "GEMINI_SAFETY";
    } else if (message.includes("timed out")) {
      status = 504;
      errorCategory = "GEMINI_TIMEOUT";
    }

    return NextResponse.json({ error: message, errorCategory }, { status });
  }
}
