import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { getDriveClient } from "@/lib/drive-client";

const execAsync = promisify(exec);

export async function GET() {
  const results: Record<string, any> = {
    status: "healthy",
    checks: {},
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  let isHealthy = true;

  // 1. Check FFmpeg and FFprobe
  try {
    const ffmpegPath = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
    await execAsync(`${ffmpegPath} -version`);
    results.checks.ffmpeg = "ok";
  } catch (err) {
    results.checks.ffmpeg = "failed";
    isHealthy = false;
  }

  try {
    const ffprobePath = fs.existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
    await execAsync(`${ffprobePath} -version`);
    results.checks.ffprobe = "ok";
  } catch (err) {
    results.checks.ffprobe = "failed";
    isHealthy = false;
  }

  // 2. Check Drive Credentials
  try {
    const driveId = process.env.UPLOADS_DRIVE_ID;
    if (!driveId) throw new Error("UPLOADS_DRIVE_ID missing");
    
    const drive = getDriveClient();
    // A lightweight list query just to test auth
    await drive.files.list({
      q: `'${driveId}' in parents`,
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    results.checks.drive = "ok";
  } catch (err) {
    results.checks.drive = `failed: ${err instanceof Error ? err.message : String(err)}`;
    isHealthy = false;
  }

  // 3. Check Gemini API Key
  if (!process.env.GEMINI_API_KEY) {
    results.checks.gemini = "failed: GEMINI_API_KEY missing";
    isHealthy = false;
  } else {
    results.checks.gemini = "ok";
  }

  // 4. Check essential Environment Variables
  const requiredEnv = [
    "UPLOADS_DRIVE_ID",
    "YOUTUBE_DRIVE_ID",
    "GOOGLE_SERVICE_ACCOUNT_JSON"
  ];
  const missingEnv = requiredEnv.filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    results.checks.env = `failed: missing ${missingEnv.join(", ")}`;
    isHealthy = false;
  } else {
    results.checks.env = "ok";
  }

  // 5. Disk space (macOS / Unix)
  try {
    const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $4}'");
    const freeSpace = stdout.trim();
    results.checks.disk = freeSpace;
    // We don't fail the health check automatically for disk space unless we parse it,
    // but exposing the string like "1.5T" or "4.2G" is helpful for monitoring.
  } catch (err) {
    results.checks.disk = "unknown";
  }

  results.status = isHealthy ? "healthy" : "unhealthy";

  return NextResponse.json(results, { status: isHealthy ? 200 : 503 });
}
