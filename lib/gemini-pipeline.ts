import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { getDriveClient } from "./drive-client";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadResult {
  tmpPath: string;
  fileName: string;
  mimeType: string;
}

export interface GeminiProcessedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export interface PipelineResult {
  generatedText: string;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Drive Download
// ---------------------------------------------------------------------------

/**
 * Download a Drive file to a specific temporary path and return metadata.
 *
 * RESILIENCE FIX (Pillar 1): The caller provides `destPath` so the
 * try...finally cleanup block always has access to the file path,
 * even if this function crashes mid-stream.
 */
export async function downloadFromDrive(
  driveFileId: string,
  destPath: string
): Promise<{ fileName: string; mimeType: string }> {
  const drive = getDriveClient();

  // Fetch metadata first (name + mimeType)
  let meta = await drive.files.get({
    fileId: driveFileId,
    fields: "name,mimeType,size,shortcutDetails",
    supportsAllDrives: true,
  });

  console.log(`[pipeline] File Metadata:`, JSON.stringify(meta.data));

  // Handle Google Drive shortcuts
  let actualFileId = driveFileId;
  if (meta.data.mimeType === "application/vnd.google-apps.shortcut") {
    if (!meta.data.shortcutDetails?.targetId) {
      throw new Error("Provided file is a shortcut but the target cannot be found or accessed.");
    }
    actualFileId = meta.data.shortcutDetails.targetId;
    console.log(`[pipeline] Resolving shortcut to target file: ${actualFileId}`);

    // Fetch metadata for the actual video file
    meta = await drive.files.get({
      fileId: actualFileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });
    console.log(`[pipeline] Target Metadata:`, JSON.stringify(meta.data));
  }

  // Prevent trying to download a Google Doc/Sheet/Slides file
  if (meta.data.mimeType?.includes("application/vnd.google-apps")) {
    throw new Error(
      `File is a Google Workspace Document (${meta.data.mimeType}), not a binary video file. Please provide the ID of an actual video file (e.g., .mp4).`
    );
  }

  const fileName = meta.data.name ?? `video-${actualFileId}`;
  const mimeType = meta.data.mimeType ?? "video/mp4";

  // Stream the file content to disk — avoids loading it all into memory
  const res = await drive.files.get(
    { fileId: actualFileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );

  await new Promise<void>((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    (res.data as NodeJS.ReadableStream)
      .pipe(dest)
      .on("finish", resolve)
      .on("error", reject);
  });

  return { fileName, mimeType };
}

// ---------------------------------------------------------------------------
// Gemini File API Upload
// ---------------------------------------------------------------------------

/**
 * Upload a local file to the Gemini File API.
 * This streams the file directly — no Base64 encoding, no memory spike.
 */
export async function uploadToGemini(
  apiKey: string,
  filePath: string,
  mimeType: string,
  displayName: string
) {
  const fileManager = new GoogleAIFileManager(apiKey);

  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName,
  });

  return uploadResult.file;
}

// ---------------------------------------------------------------------------
// Gemini File Processing Poller
// ---------------------------------------------------------------------------

/**
 * Poll the Gemini File API until the file state is ACTIVE (processed).
 * Uses exponential backoff: 2s → 4s → 8s → 16s → 16s … (capped).
 * Throws after maxWaitMs (default 5 minutes).
 */
export async function waitForFileActive(
  apiKey: string,
  fileName: string,
  maxWaitMs = 5 * 60 * 1000
) {
  const fileManager = new GoogleAIFileManager(apiKey);
  const startTime = Date.now();
  let backoffMs = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const fileInfo = await fileManager.getFile(fileName);

    if (fileInfo.state === FileState.ACTIVE) {
      return fileInfo;
    }

    if (fileInfo.state === FileState.FAILED) {
      throw new Error(
        `Gemini file processing failed for ${fileName}: ${fileInfo.state}`
      );
    }

    // PROCESSING — wait and retry
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 16000); // cap at 16s
  }

  throw new Error(
    `Gemini file processing timed out after ${maxWaitMs / 1000}s for ${fileName}`
  );
}

// ---------------------------------------------------------------------------
// Temp Path Helper
// ---------------------------------------------------------------------------

/** Generate a unique temp file path for a given file extension. */
export function createTempPath(originalFileName?: string): string {
  const ext = originalFileName ? path.extname(originalFileName) || ".mp4" : ".mp4";
  return path.join(os.tmpdir(), `${randomUUID()}${ext}`);
}

/** Safely delete a temp file, ignoring errors if it doesn't exist. */
export function cleanupTempFile(filePath: string | null): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
    console.log(`[pipeline] Cleaned up temp file: ${filePath}`);
  } catch {
    // File may already be deleted — that's fine
  }
}

// ---------------------------------------------------------------------------
// Generic Pipeline: Drive → Gemini → Generate
// ---------------------------------------------------------------------------

export interface PreparedVideo {
  activeFile: { uri: string; mimeType: string; name: string };
  fileName: string;
}

/**
 * Prepare a video for Gemini by downloading from Drive, uploading to the
 * Gemini File API, and polling until it's ACTIVE. Returns the active file
 * reference that can be reused for multiple generation prompts.
 *
 * The caller is responsible for the temp file only if they need custom
 * cleanup — this function handles its own cleanup internally.
 */
export async function prepareVideoForGemini(
  driveFileId: string
): Promise<PreparedVideo> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const tmpPath = createTempPath();

  try {
    // Step 1: Download from Drive
    console.log(`[pipeline] Downloading Drive file: ${driveFileId}`);
    const { fileName, mimeType } = await downloadFromDrive(driveFileId, tmpPath);
    console.log(`[pipeline] Downloaded to ${tmpPath} (${fileName}, ${mimeType})`);

    // Step 2: Upload to Gemini File API
    console.log(`[pipeline] Uploading to Gemini File API...`);
    const geminiFile = await uploadToGemini(apiKey, tmpPath, mimeType, fileName);
    console.log(`[pipeline] Uploaded: ${geminiFile.name} (state: ${geminiFile.state})`);

    // Step 3: Delete temp file immediately after upload
    cleanupTempFile(tmpPath);

    // Step 4: Wait for Gemini to finish processing the video
    console.log(`[pipeline] Waiting for file processing...`);
    const activeFile = await waitForFileActive(apiKey, geminiFile.name);
    console.log(`[pipeline] File is ACTIVE: ${activeFile.uri}`);

    return {
      activeFile: {
        uri: activeFile.uri,
        mimeType: activeFile.mimeType,
        name: activeFile.name,
      },
      fileName,
    };
  } finally {
    cleanupTempFile(tmpPath);
  }
}

/**
 * Run a single generation prompt against an already-prepared Gemini video file.
 * This can be called multiple times against the same PreparedVideo to run
 * different prompts (chapters, metadata, etc.) without re-uploading.
 */
export async function generateFromGeminiFile(
  activeFile: { uri: string; mimeType: string },
  prompt: string,
  model: string = "gemini-2.5-flash"
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const result = await genModel.generateContent([
    {
      fileData: {
        mimeType: activeFile.mimeType,
        fileUri: activeFile.uri,
      },
    },
    { text: prompt },
  ]);

  const response = await result.response;
  return response.text();
}

/**
 * Convenience wrapper: single-prompt pipeline (backward compatible).
 * Downloads, uploads, polls, generates — all in one call.
 */
export async function processVideoWithGemini(
  driveFileId: string,
  prompt: string,
  model: string = "gemini-2.5-flash"
): Promise<PipelineResult> {
  const { activeFile, fileName } = await prepareVideoForGemini(driveFileId);
  const generatedText = await generateFromGeminiFile(activeFile, prompt, model);
  return { generatedText, fileName };
}

