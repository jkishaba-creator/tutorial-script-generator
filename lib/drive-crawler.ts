/**
 * Drive Crawler — Recursive Shared Drive navigator for the Conveyor Belt.
 *
 * Navigates the Uploads Shared Drive hierarchy:
 *   Level 1: Producer folders (Eli, Ar, Ad, Shara, Paula, Mardz)
 *   Level 2: Software folders (Cursor, Figma, etc.)
 *   Level 3: Date folders (YYYY-MM-DD)
 *
 * Also manages the YouTube Shared Drive output structure:
 *   Software > Date > Producer_filename_FINISHED.mp4
 *
 * All Drive API calls use supportsAllDrives + includeItemsFromAllDrives
 * because both Uploads and YouTube are Shared Drives.
 */

import { getDriveClientReadWrite } from "@/lib/drive-client";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import fs from "fs";
import path from "path";
import retry from "async-retry";

// ── Types ───────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
}

export interface CrawlJob {
  /** Producer name from Level 1 folder */
  producerName: string;
  /** Software name from Level 2 folder */
  softwareName: string;
  /** Date string from Level 3 folder (YYYY-MM-DD) */
  dateFolder: string;
  /** The video file in Uploads */
  videoFile: DriveFile;
  /** The matching audio file in Uploads */
  audioFile: DriveFile;
  /** The ID of the date folder in Uploads (for purge) */
  uploadDateFolderId: string;
  /** Version number if this is a reprocessing job */
  version?: number;
}

// ── Constants ───────────────────────────────────────────────────────

const FOLDER_MIME = "application/vnd.google-apps.folder";
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".webm"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"];
const PURGE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

// ── Shared Drive Helpers ────────────────────────────────────────────

/**
 * List all child items (files or folders) in a Shared Drive folder.
 * Handles pagination automatically.
 */
export async function listChildren(
  parentId: string,
  mimeFilter?: string
): Promise<DriveFile[]> {
  const drive = getDriveClientReadWrite();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  const qParts = [`'${parentId}' in parents`, "trashed = false"];
  if (mimeFilter) {
    qParts.push(`mimeType = '${mimeFilter}'`);
  }

  do {
    const res = await drive.files.list({
      q: qParts.join(" and "),
      fields: "nextPageToken, files(id, name, mimeType, createdTime)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (res.data.files) {
      for (const f of res.data.files) {
        if (f.id && f.name && f.mimeType) {
          files.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            createdTime: f.createdTime ?? undefined,
          });
        }
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/**
 * List only subfolders of a parent.
 */
export async function listFolders(parentId: string): Promise<DriveFile[]> {
  return listChildren(parentId, FOLDER_MIME);
}

// ── READY Signal Detection ──────────────────────────────────────────

/**
 * Check if a file named "READY" (case-insensitive, any type) exists in a folder.
 * The producer drops this file to signal the folder is complete and ready for processing.
 */
export async function hasReadySignal(dateFolderId: string): Promise<boolean> {
  const drive = getDriveClientReadWrite();
  const res = await drive.files.list({
    q: `'${dateFolderId}' in parents and name = 'READY' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files?.length ?? 0) > 0;
}

/**
 * After all videos in a folder are processed:
 * 1. Delete the READY file
 * 2. Create a PROCESSED file so the producer sees confirmation in Drive
 */
export async function markFolderProcessed(dateFolderId: string): Promise<void> {
  const drive = getDriveClientReadWrite();

  // Find and delete the READY file
  const readyFiles = await drive.files.list({
    q: `'${dateFolderId}' in parents and name = 'READY' and trashed = false`,
    fields: "files(id)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  for (const f of readyFiles.data.files || []) {
    if (f.id) {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
      console.log(`[crawler] Deleted READY file: ${f.id}`);
    }
  }

  // Create a PROCESSED file
  await drive.files.create({
    requestBody: {
      name: "PROCESSED",
      mimeType: "application/vnd.google-apps.document",
      parents: [dateFolderId],
    },
    supportsAllDrives: true,
  });
  console.log(`[crawler] Created PROCESSED marker in folder ${dateFolderId}`);
}

/**
 * Scan the Uploads Drive hierarchy and return all date folders with metadata.
 * Used by the worker's scan trigger to discover folders for the Ava UI.
 */
export async function scanUploadsDrive(uploadsDriveId: string): Promise<{
  folderId: string;
  path: string;
  producer: string;
  software: string;
  date: string;
  videoCount: number;
  hasReady: boolean;
  hasProcessed: boolean;
}[]> {
  const results: {
    folderId: string;
    path: string;
    producer: string;
    software: string;
    date: string;
    videoCount: number;
    hasReady: boolean;
    hasProcessed: boolean;
  }[] = [];

  // Level 1: Producer folders
  const producers = await listFolders(uploadsDriveId);

  for (const producer of producers) {
    // Level 2: Software folders
    const softwareFolders = await listFolders(producer.id);

    for (const software of softwareFolders) {
      // Level 3: Date folders
      const dateFolders = await listFolders(software.id);

      for (const dateFolder of dateFolders) {
        // Count video files
        const allFiles = await listChildren(dateFolder.id);
        const videoCount = allFiles.filter((f) =>
          VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
        ).length;

        if (videoCount === 0) continue; // Skip empty date folders

        // Check for READY / PROCESSED signals
        const hasReady = allFiles.some((f) => f.name.toUpperCase() === "READY");
        const hasProcessed = allFiles.some((f) => f.name.toUpperCase() === "PROCESSED");

        results.push({
          folderId: dateFolder.id,
          path: `${producer.name}/${software.name}/${dateFolder.name}`,
          producer: producer.name,
          software: software.name,
          date: dateFolder.name,
          videoCount,
          hasReady,
          hasProcessed,
        });
      }
    }
  }

  return results;
}

/**
 * Find a subfolder by name inside a parent. Returns null if not found.
 */
export async function findFolder(
  parentId: string,
  folderName: string
): Promise<DriveFile | null> {
  const drive = getDriveClientReadWrite();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${folderName}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const f = res.data.files?.[0];
  if (f?.id && f?.name && f?.mimeType) {
    return { id: f.id, name: f.name, mimeType: f.mimeType };
  }
  return null;
}

/**
 * Create a folder inside a parent. Returns the new folder.
 */
export async function createFolder(
  parentId: string,
  folderName: string
): Promise<DriveFile> {
  const drive = getDriveClientReadWrite();
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });

  if (!res.data.id || !res.data.name) {
    throw new Error(`Failed to create folder "${folderName}" in ${parentId}`);
  }

  return {
    id: res.data.id,
    name: res.data.name,
    mimeType: FOLDER_MIME,
  };
}

/**
 * Find or create a folder path: YouTube Drive > Software > Date
 * Returns the ID of the final date folder.
 */
export async function ensureYouTubePath(
  youtubeDriveId: string,
  softwareName: string,
  dateFolder: string
): Promise<string> {
  // Level 1: Software folder
  let softwareFolder = await findFolder(youtubeDriveId, softwareName);
  if (!softwareFolder) {
    console.log(`Creating YouTube folder: ${softwareName}`);
    softwareFolder = await createFolder(youtubeDriveId, softwareName);
  }

  // Level 2: Date folder
  let dateDir = await findFolder(softwareFolder.id, dateFolder);
  if (!dateDir) {
    console.log(`Creating YouTube folder: ${softwareName}/${dateFolder}`);
    dateDir = await createFolder(softwareFolder.id, dateFolder);
  }

  return dateDir.id;
}

// ── Smart Skip & Reprocessing ───────────────────────────────────────

export interface FinishedStatus {
  exists: boolean;
  latestCreatedTime?: string;
  nextVersion: number;
}

/**
 * Check if a finished render already exists in the YouTube Drive.
 * Scans the target date folder for all files containing the base name to find
 * the latest version and its creation time. This allows us to compare timestamps
 * for Smart Reprocessing.
 */
export async function checkFinishedStatus(
  youtubeDriveId: string,
  softwareName: string,
  dateFolder: string,
  baseFilename: string // e.g. "Producer_filename" without _FINISHED.mp4
): Promise<FinishedStatus> {
  // Find the software folder
  const softwareDir = await findFolder(youtubeDriveId, softwareName);
  if (!softwareDir) return { exists: false, nextVersion: 1 };

  // Find the date folder
  const dateDir = await findFolder(softwareDir.id, dateFolder);
  if (!dateDir) return { exists: false, nextVersion: 1 };

  // Fetch all files in the date folder
  const drive = getDriveClientReadWrite();
  const res = await drive.files.list({
    q: `'${dateDir.id}' in parents and trashed = false`,
    fields: "files(id, name, createdTime)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files || [];

  // Filter files that match our base name (ignoring REVIEW_ prefix if present)
  // We want to match Producer_filename_FINISHED.mp4, Producer_filename_v2_FINISHED.mp4, etc.
  const safeBaseName = baseFilename.toLowerCase();
  
  const matchingFiles = files.filter(f => {
    if (!f.name) return false;
    const nameLower = f.name.toLowerCase();
    return nameLower.includes(safeBaseName) && nameLower.includes("_finished.mp4");
  });

  if (matchingFiles.length === 0) {
    return { exists: false, nextVersion: 1 };
  }

  // Find the latest createdTime and the highest version number
  let latestCreatedTime = "";
  let highestVersion = 1;

  for (const f of matchingFiles) {
    if (f.createdTime && f.createdTime > latestCreatedTime) {
      latestCreatedTime = f.createdTime;
    }
    
    // Extract version number if it exists (e.g. _v2_, _v3_)
    const vMatch = f.name!.match(/_v(\d+)_FINISHED\.mp4$/i);
    if (vMatch && vMatch[1]) {
      const v = parseInt(vMatch[1], 10);
      if (v > highestVersion) {
        highestVersion = v;
      }
    }
  }

  return {
    exists: true,
    latestCreatedTime: latestCreatedTime || undefined,
    nextVersion: highestVersion + 1
  };
}

// ── Download / Upload / Purge ───────────────────────────────────────

/**
 * Download a file from a Shared Drive to a local path.
 */
export async function downloadFile(fileId: string, destPath: string): Promise<void> {
  const drive = getDriveClientReadWrite();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(destPath);
  await pipeline(res.data as unknown as Readable, writeStream);
}

/**
 * Upload a file to a Shared Drive folder with retry logic.
 * Returns the Drive file ID.
 */
export async function uploadFile(
  localPath: string,
  fileName: string,
  parentFolderId: string
): Promise<string> {
  const drive = getDriveClientReadWrite();

  const fileId = await retry(
    async () => {
      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentFolderId],
        },
        media: {
          mimeType: "video/mp4",
          body: fs.createReadStream(localPath),
        },
        fields: "id",
        supportsAllDrives: true,
      });

      if (!res.data.id) {
        throw new Error("Upload returned no file ID");
      }
      return res.data.id;
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 2000,
      maxTimeout: 15000,
      onRetry: (err: Error, attempt: number) => {
        console.warn(`Upload retry ${attempt}/3 for ${fileName}:`, err.message);
      },
    }
  );

  return fileId;
}

/**
 * Verify a finished file exists in the YouTube Drive.
 * This is the watertight check before purging — we re-query Drive
 * to confirm the upload actually landed.
 */
export async function verifyUploadExists(
  targetFolderId: string,
  fileName: string
): Promise<boolean> {
  const drive = getDriveClientReadWrite();
  const res = await drive.files.list({
    q: `'${targetFolderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files?.length ?? 0) > 0;
}

/**
 * Move a file from a Shared Drive to the Trash if it's older than 48 hours.
 * Returns true if the file was trashed.
 */
export async function purgeIfOld(fileId: string, createdTime: string | undefined): Promise<boolean> {
  if (!createdTime) {
    console.warn(`Cannot purge file ${fileId}: no createdTime available`);
    return false;
  }

  const ageMs = Date.now() - new Date(createdTime).getTime();
  if (ageMs < PURGE_THRESHOLD_MS) {
    console.log(`File ${fileId} is ${(ageMs / 3600000).toFixed(1)}h old, keeping (< 48h)`);
    return false;
  }

  const drive = getDriveClientReadWrite();
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
  console.log(`Purged file ${fileId} (${(ageMs / 3600000).toFixed(1)}h old)`);
  return true;
}

// ── The Crawler ─────────────────────────────────────────────────────

/**
 * Strip file extension from a filename.
 */
export function stripExtension(name: string): string {
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * Check if a filename has a video extension.
 */
function isVideoFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Check if a filename has an audio extension.
 */
function isAudioFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Check if a folder name matches YYYY-MM-DD date format.
 */
function isDateFolder(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

/**
 * Build the finished filename: originalname_Producer_vX_FINISHED.mp4
 */
export function buildFinishedFilename(producerName: string, originalName: string, version?: number): string {
  const baseName = stripExtension(originalName);
  if (version && version > 1) {
    return `${baseName}_${producerName}_v${version}_FINISHED.mp4`;
  }
  return `${baseName}_${producerName}_FINISHED.mp4`;
}

/**
 * Crawl the Uploads Shared Drive and build a list of all jobs to process.
 *
 * @param uploadsDriveId   Root ID of the Uploads Shared Drive
 * @param youtubeDriveId   Root ID of the YouTube Shared Drive (for Smart Skip)
 * @param specificDate     Optional: only process this date (YYYY-MM-DD)
 * @param targetFolderId   Optional: process only this specific folder ID
 */
export async function crawlUploadsDrive(
  uploadsDriveId: string,
  youtubeDriveId: string,
  specificDate?: string,
  targetFolderId?: string
): Promise<{ jobs: CrawlJob[]; skipped: number; errors: string[] }> {
  const jobs: CrawlJob[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // If a specific folder ID is provided, we need to figure out the context
  // (producer, software, date) from the folder path. For now, this is handled
  // by the route passing the parameters differently.

  // Level 1: List producer folders
  console.log("Crawling Uploads Drive...");
  const producers = await listFolders(uploadsDriveId);
  console.log(`Found ${producers.length} producer folders: ${producers.map((p) => p.name).join(", ")}`);

  for (const producer of producers) {
    // Level 2: List software folders
    const softwareFolders = await listFolders(producer.id);

    for (const software of softwareFolders) {
      // Level 3: List date folders
      const dateFolders = await listFolders(software.id);

      for (const dateDir of dateFolders) {
        // Validate it's a YYYY-MM-DD folder
        if (!isDateFolder(dateDir.name)) {
          console.warn(`Skipping non-date folder: ${producer.name}/${software.name}/${dateDir.name}`);
          continue;
        }

        // Filter by specificDate if provided
        if (specificDate && dateDir.name !== specificDate) {
          continue;
        }

        // Filter by targetFolderId if provided
        if (targetFolderId && dateDir.id !== targetFolderId) {
          continue;
        }

        // List all files in the date folder
        const allFiles = await listChildren(dateDir.id);
        const videoFiles = allFiles.filter((f) => isVideoFile(f.name));
        const audioFiles = allFiles.filter((f) => isAudioFile(f.name));

        for (const video of videoFiles) {
          const baseName = stripExtension(video.name);
          // Pass just the raw base name to checkFinishedStatus so it can find 
          // both old (Producer_filename) and new (filename_Producer) naming formats.
          
          let finalVersion: number | undefined;

          // Smart Skip & Reprocessing: check YouTube Drive
          try {
            const status = await checkFinishedStatus(
              youtubeDriveId,
              software.name,
              dateDir.name,
              baseName
            );

            if (status.exists) {
              const uploadTime = new Date(video.createdTime || 0).getTime();
              const finishedTime = new Date(status.latestCreatedTime || 0).getTime();

              if (uploadTime <= finishedTime) {
                console.log(`Smart Skip: "${baseName}" already finished in YouTube/${software.name}/${dateDir.name}/`);
                skipped++;
                
                // Deep Cleanup: Even though we skipped it, we should purge it if it's > 48h old!
                const ageHours = (Date.now() - uploadTime) / (1000 * 60 * 60);
                if (ageHours >= 48) {
                  try {
                    await purgeIfOld(video.id, video.createdTime);
                    
                    // Also try to purge matching audio if it exists
                    const matchingAudioForPurge = audioFiles.find((a) => {
                      return stripExtension(a.name).toLowerCase() === baseName.toLowerCase();
                    });
                    if (matchingAudioForPurge) {
                      await purgeIfOld(matchingAudioForPurge.id, matchingAudioForPurge.createdTime);
                    }
                  } catch (purgeErr) {
                    console.error(`[drive-crawler] Cleanup failed for skipped file ${video.name}:`, purgeErr);
                  }
                }
                
                continue;
              } else {
                console.log(`Reprocess Triggered: Uploaded "${baseName}" is newer than finished version. Upgrading to v${status.nextVersion}.`);
                finalVersion = status.nextVersion;
              }
            }
          } catch (err) {
            console.warn(`Smart Skip check failed for ${video.name}, will process:`, err);
          }

          // Find matching audio
          const matchingAudio = audioFiles.find((a) => {
            return stripExtension(a.name).toLowerCase() === baseName.toLowerCase();
          });

          if (!matchingAudio) {
            const msg = `No matching audio for: ${producer.name}/${software.name}/${dateDir.name}/${video.name}`;
            console.error(msg);
            errors.push(msg);
            continue;
          }

          jobs.push({
            producerName: producer.name,
            softwareName: software.name,
            dateFolder: dateDir.name,
            videoFile: video,
            audioFile: matchingAudio,
            uploadDateFolderId: dateDir.id,
            version: finalVersion, // pass version flag if reprocessing
          });
        }
      }
    }
  }

  console.log(`Crawl complete: ${jobs.length} jobs to process, ${skipped} skipped, ${errors.length} errors`);
  return { jobs, skipped, errors };
}
