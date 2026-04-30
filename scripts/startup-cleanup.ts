import fs from "fs";
import path from "path";
import os from "os";

/**
 * Startup Cleanup — Purges orphaned /tmp/nightshift directories.
 * If the Next.js process crashes due to OOM or a forced restart via PM2,
 * the /tmp directory could be left with gigabytes of half-rendered video files.
 * This script runs every time the Next.js server boots to ensure a clean slate.
 */
export function purgeZombieTmpFiles() {
  const tmpBase = path.join(os.tmpdir(), "nightshift");
  
  try {
    if (!fs.existsSync(tmpBase)) {
      return;
    }

    const entries = fs.readdirSync(tmpBase);
    let deletedCount = 0;

    for (const entry of entries) {
      const entryPath = path.join(tmpBase, entry);
      const stat = fs.statSync(entryPath);

      if (stat.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Startup Cleanup] Purged ${deletedCount} zombie batch folder(s) from ${tmpBase}`);
    } else {
      console.log(`[Startup Cleanup] Clean slate. No zombie /tmp files found.`);
    }
  } catch (err) {
    console.error("[Startup Cleanup] Failed to purge /tmp directories:", err);
  }
}
