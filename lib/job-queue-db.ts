import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface Job {
  id: string; // The Google Drive file ID
  batchId: string;
  videoName: string;
  status: "pending" | "downloading" | "processing" | "uploading" | "done" | "error" | "skipped";
  renderPercent: number;
  addedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  // We can store stringified JSON for the file metadata
  fileMetaJson: string; 
}

const DB_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, "queue.db");
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    batchId TEXT NOT NULL,
    videoName TEXT NOT NULL,
    status TEXT NOT NULL,
    renderPercent INTEGER NOT NULL DEFAULT 0,
    addedAt TEXT NOT NULL,
    startedAt TEXT,
    completedAt TEXT,
    errorMessage TEXT,
    skipReason TEXT,
    fileMetaJson TEXT NOT NULL
  );
`);

export const jobQueueDB = {
  addJob: (job: Omit<Job, "status" | "renderPercent" | "addedAt" | "startedAt" | "completedAt" | "errorMessage" | "skipReason">): Job => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO jobs (id, batchId, videoName, status, renderPercent, addedAt, fileMetaJson)
      VALUES (?, ?, ?, 'pending', 0, ?, ?)
    `);
    stmt.run(job.id, job.batchId, job.videoName, new Date().toISOString(), job.fileMetaJson);
    return jobQueueDB.getJob(job.id)!;
  },

  getJob: (id: string): Job | undefined => {
    const stmt = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
    return stmt.get(id) as Job | undefined;
  },

  getJobsByBatch: (batchId: string): Job[] => {
    const stmt = db.prepare(`SELECT * FROM jobs WHERE batchId = ? ORDER BY addedAt ASC`);
    return stmt.all(batchId) as Job[];
  },

  getAllJobs: (): Job[] => {
    const stmt = db.prepare(`SELECT * FROM jobs ORDER BY addedAt DESC`);
    return stmt.all() as Job[];
  },

  getNextPendingJob: (): Job | undefined => {
    const stmt = db.prepare(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY addedAt ASC LIMIT 1`);
    return stmt.get() as Job | undefined;
  },

  updateJobStatus: (id: string, status: Job["status"], percent: number = 0) => {
    if (status === "downloading" || status === "processing" || status === "uploading") {
      const stmt = db.prepare(`UPDATE jobs SET status = ?, renderPercent = ?, startedAt = COALESCE(startedAt, ?) WHERE id = ?`);
      stmt.run(status, percent, new Date().toISOString(), id);
    } else if (status === "done" || status === "error" || status === "skipped") {
      const stmt = db.prepare(`UPDATE jobs SET status = ?, renderPercent = ?, completedAt = ? WHERE id = ?`);
      stmt.run(status, percent, new Date().toISOString(), id);
    } else {
      const stmt = db.prepare(`UPDATE jobs SET status = ?, renderPercent = ? WHERE id = ?`);
      stmt.run(status, percent, id);
    }
  },

  setJobError: (id: string, error: string) => {
    const stmt = db.prepare(`UPDATE jobs SET status = 'error', errorMessage = ?, completedAt = ? WHERE id = ?`);
    stmt.run(error, new Date().toISOString(), id);
  },

  setJobSkipped: (id: string, reason: string) => {
    const stmt = db.prepare(`UPDATE jobs SET status = 'skipped', skipReason = ?, completedAt = ? WHERE id = ?`);
    stmt.run(reason, new Date().toISOString(), id);
  },

  resetStalledJobs: () => {
    // Crash recovery: Any job marked downloading/processing/uploading is stalled
    const stmt = db.prepare(`
      UPDATE jobs 
      SET status = 'pending', renderPercent = 0, startedAt = NULL 
      WHERE status IN ('downloading', 'processing', 'uploading')
    `);
    const info = stmt.run();
    return info.changes;
  },

  deleteJob: (id: string) => {
    const stmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);
    stmt.run(id);
  },

  clearQueue: () => {
    db.exec(`DELETE FROM jobs`);
  }
};
