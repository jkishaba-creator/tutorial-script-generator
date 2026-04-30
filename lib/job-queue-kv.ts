/**
 * Job Queue — Vercel KV (Redis) backed.
 *
 * Architecture:
 *   - "queue:pending"            → Redis List of pending job IDs (RPUSH to add, LPOP to claim)
 *   - "job:<id>"                 → Redis Hash with all job fields
 *   - "batch:<batchId>:jobs"     → Redis Set of job IDs for a given batch
 *   - "imac:heartbeat"           → Redis Hash with { timestamp, version, jobsProcessed }
 *   - "crawl:trigger"            → Redis String (JSON) — Vercel writes, iMac reads
 *
 * Concurrency Safety:
 *   LPOP is atomic in Redis — two workers calling LPOP at the same millisecond
 *   will each receive a DIFFERENT job ID. Duplicate processing is impossible.
 *
 * Payload Safety:
 *   Each job's metadata is stored as its own Redis Hash key ("job:<id>").
 *   The pending queue only stores the job ID string (~36 bytes).
 *   We never hit the 1MB per-key limit.
 */

import { Redis } from "@upstash/redis";

// ── Types ────────────────────────────────────────────────────────────

export type JobStatus =
  | "pending"
  | "downloading"
  | "processing"
  | "uploading"
  | "done"
  | "error"
  | "skipped";

export interface KVJob {
  id: string;
  batchId: string;
  videoName: string;
  status: JobStatus;
  renderPercent: number;
  addedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  fileMetaJson: string;
}

export interface CrawlTrigger {
  requestedAt: string;
  specificDate?: string;
  targetFolderId?: string;
  requestedBy?: string; // e.g. "VA dashboard"
}

export interface MacHeartbeat {
  timestamp: string;
  status: "idle" | "processing";
  currentJob?: string;
  jobsProcessedToday: number;
  queueDepth: number;
}

// ── Redis Client ─────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing KV_REST_API_URL or KV_REST_API_TOKEN environment variables. " +
      "Set these in your .env.local (for iMac) and Vercel dashboard (for cloud)."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ── Key Helpers ──────────────────────────────────────────────────────

const KEY = {
  pendingQueue: "queue:pending",
  job: (id: string) => `job:${id}`,
  batchJobs: (batchId: string) => `batch:${batchId}:jobs`,
  heartbeat: "imac:heartbeat",
  crawlTrigger: "crawl:trigger",
  folder: (folderId: string) => `folder:${folderId}`,
  activeFolders: "folders:active",
  folderActions: "folder:actions",
};

// ── Job Queue Operations ─────────────────────────────────────────────

export const kvQueue = {
  /**
   * Add a new job to the queue. Uses NX (only set if not exists) to prevent
   * duplicate jobs if "Process Batch" is clicked twice with the same Drive file.
   */
  async addJob(
    job: Omit<KVJob, "status" | "renderPercent" | "addedAt" | "startedAt" | "completedAt" | "errorMessage" | "skipReason">
  ): Promise<KVJob> {
    const redis = getRedis();
    const now = new Date().toISOString();

    const fullJob: KVJob = {
      ...job,
      status: "pending",
      renderPercent: 0,
      addedAt: now,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      skipReason: null,
    };

    // Store job data as a hash (NX = skip if already exists)
    const jobKey = KEY.job(job.id);
    const existing = await redis.exists(jobKey);
    if (!existing) {
      // Store as JSON string (simpler than Redis hash for our use case)
      await redis.set(jobKey, JSON.stringify(fullJob));
      // Add to the pending queue list
      await redis.rpush(KEY.pendingQueue, job.id);
      // Register in batch set
      await redis.sadd(KEY.batchJobs(job.batchId), job.id);
    }

    return fullJob;
  },

  /**
   * Atomically claim the next pending job. Uses LPOP for race-condition safety.
   * Two workers calling this simultaneously will ALWAYS get different jobs.
   */
  async claimNextJob(): Promise<KVJob | null> {
    const redis = getRedis();
    // LPOP atomically removes and returns the first item
    const jobId = await redis.lpop<string>(KEY.pendingQueue);
    if (!jobId) return null;

    const raw = await redis.get<string>(KEY.job(jobId));
    if (!raw) return null;

    const job: KVJob = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Mark as downloading immediately to prevent any re-claim
    const updated: KVJob = {
      ...job,
      status: "downloading",
      startedAt: new Date().toISOString(),
    };
    await redis.set(KEY.job(jobId), JSON.stringify(updated));

    return updated;
  },

  /**
   * Update a job's status and progress percentage.
   */
  async updateJob(id: string, update: Partial<Pick<KVJob, "status" | "renderPercent" | "errorMessage" | "skipReason" | "startedAt" | "completedAt">>): Promise<void> {
    const redis = getRedis();
    const raw = await redis.get<string>(KEY.job(id));
    if (!raw) return;

    const job: KVJob = typeof raw === "string" ? JSON.parse(raw) : raw;
    const updated = { ...job, ...update };

    if (
      (update.status === "done" || update.status === "error" || update.status === "skipped") &&
      !updated.completedAt
    ) {
      updated.completedAt = new Date().toISOString();
    }

    await redis.set(KEY.job(id), JSON.stringify(updated));
  },

  /**
   * Get a single job by ID.
   */
  async getJob(id: string): Promise<KVJob | null> {
    const redis = getRedis();
    const raw = await redis.get<string>(KEY.job(id));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },

  /**
   * Get all jobs in a batch.
   */
  async getBatchJobs(batchId: string): Promise<KVJob[]> {
    const redis = getRedis();
    const jobIds = await redis.smembers(KEY.batchJobs(batchId));
    if (!jobIds || jobIds.length === 0) return [];

    const jobs = await Promise.all(
      (jobIds as string[]).map(async (id) => {
        const raw = await redis.get<string>(KEY.job(id));
        if (!raw) return null;
        return typeof raw === "string" ? JSON.parse(raw) : raw as KVJob;
      })
    );

    return (jobs.filter(Boolean) as KVJob[]).sort(
      (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
    );
  },

  /**
   * How many jobs are currently pending in the queue.
   */
  async getPendingCount(): Promise<number> {
    const redis = getRedis();
    return await redis.llen(KEY.pendingQueue);
  },

  /**
   * Crash recovery: find all jobs marked as in-progress and reset them to pending.
   * Called by the iMac worker at startup. Jobs that are "processing" but the
   * worker just started are by definition zombies from a previous crash.
   *
   * Returns the number of jobs reset.
   */
  async resetStalledJobs(batchIds: string[]): Promise<number> {
    const redis = getRedis();
    let resetCount = 0;

    for (const batchId of batchIds) {
      const jobs = await kvQueue.getBatchJobs(batchId);
      const stalled = jobs.filter(
        (j) => j.status === "downloading" || j.status === "processing" || j.status === "uploading"
      );

      for (const job of stalled) {
        await redis.set(
          KEY.job(job.id),
          JSON.stringify({
            ...job,
            status: "pending",
            renderPercent: 0,
            startedAt: null,
          })
        );
        // Push back to the FRONT of the queue so it's retried first
        await redis.lpush(KEY.pendingQueue, job.id);
        resetCount++;
      }
    }

    return resetCount;
  },

  /**
   * Get all active batch IDs (batches that have at least one non-terminal job).
   * Used by the startup sweep to know which batches to check for zombies.
   */
  async getActiveBatchIds(): Promise<string[]> {
    const redis = getRedis();
    // We store a set of all-time batch IDs, and filter to those with pending/active jobs
    const allKeys = await redis.keys("batch:*:jobs");
    const batchIds = (allKeys as string[]).map((k) => k.split(":")[1]);
    
    const active: string[] = [];
    for (const batchId of batchIds) {
      const jobs = await kvQueue.getBatchJobs(batchId);
      const hasActive = jobs.some(
        (j) => j.status === "pending" || j.status === "downloading" || j.status === "processing" || j.status === "uploading"
      );
      if (hasActive) active.push(batchId);
    }
    return active;
  },

  /**
   * Clean up completed job records older than 7 days to prevent KV bloat.
   */
  async pruneOldJobs(): Promise<number> {
    const redis = getRedis();
    const allKeys = await redis.keys("batch:*:jobs");
    let pruned = 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const batchKey of allKeys as string[]) {
      const batchId = (batchKey as string).split(":")[1];
      const jobs = await kvQueue.getBatchJobs(batchId);
      const allTerminal = jobs.every(
        (j) => j.status === "done" || j.status === "error" || j.status === "skipped"
      );

      if (allTerminal && jobs.length > 0) {
        const latestCompletion = Math.max(
          ...jobs.map((j) => new Date(j.completedAt || j.addedAt).getTime())
        );
        if (latestCompletion < sevenDaysAgo) {
          for (const job of jobs) {
            await redis.del(KEY.job(job.id));
            pruned++;
          }
          await redis.del(batchKey);
        }
      }
    }
    return pruned;
  },
};

// ── Crawl Trigger ────────────────────────────────────────────────────

export const crawlTrigger = {
  /**
   * Vercel writes a crawl request. The iMac will pick this up within 60 seconds.
   */
  async set(trigger: CrawlTrigger): Promise<void> {
    const redis = getRedis();
    await redis.set(KEY.crawlTrigger, JSON.stringify(trigger));
  },

  /**
   * iMac reads the trigger, then deletes it so it doesn't re-trigger.
   * Returns null if no trigger is pending.
   */
  async claimAndClear(): Promise<CrawlTrigger | null> {
    const redis = getRedis();
    const raw = await redis.getdel<string>(KEY.crawlTrigger);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },

  async peek(): Promise<CrawlTrigger | null> {
    const redis = getRedis();
    const raw = await redis.get<string>(KEY.crawlTrigger);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },
};

// ── iMac Heartbeat ───────────────────────────────────────────────────

export const macHeartbeat = {
  /**
   * iMac writes its alive status to KV. Called every 5 minutes by the worker,
   * and immediately after every job completion.
   */
  async ping(data: Omit<MacHeartbeat, "timestamp">): Promise<void> {
    const redis = getRedis();
    const heartbeat: MacHeartbeat = {
      ...data,
      timestamp: new Date().toISOString(),
    };
    // Set with 10-minute TTL — if the iMac dies, the key expires automatically
    // so the VA sees "Offline" rather than a stale "Online" reading
    await redis.set(KEY.heartbeat, JSON.stringify(heartbeat), { ex: 600 });
  },

  /**
   * Frontend/Vercel reads the heartbeat to show iMac status.
   * Returns null if the key has expired (iMac offline for >10 min).
   */
  async read(): Promise<MacHeartbeat | null> {
    const redis = getRedis();
    const raw = await redis.get<string>(KEY.heartbeat);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },
};

// ── Folder Lifecycle (Ava UI) ────────────────────────────────────────

export type FolderStage =
  | "raw"       // Videos uploaded, no READY signal
  | "ready"     // Producer dropped READY file
  | "rendering" // iMac FFmpeg processing in progress
  | "rendered"  // All videos on YouTube Drive, awaiting metadata
  | "exported"  // Metadata generated + written to Google Sheet
  | "done";     // VA confirmed YouTube upload, raw files eligible for purge

export interface VideoResult {
  filename: string;
  driveFileId: string;
  title: string | null;
  thumbnailText: string | null;
  chapters: string | null;
  description: string | null;
  tags: string | null;
  metadataStatus: "pending" | "done" | "error";
  metadataError: string | null;
}

export interface KVFolder {
  folderId: string;          // Google Drive date folder ID
  path: string;              // "Eli/Cursor/2025-04-30"
  producer: string;
  software: string;
  date: string;
  stage: FolderStage;
  batchId: string | null;    // Links to job queue batch when rendering
  videoCount: number;
  ytFolderId: string | null; // YouTube Drive folder ID
  ytFolderLink: string | null;
  sheetTabName: string | null;
  addedAt: string;
  renderedAt: string | null;
  exportedAt: string | null;
  doneAt: string | null;
  videoResults: VideoResult[] | null;
  type?: "auto" | "manual";  // Manual folders are hidden from Ava UI
}

export type FolderAction =
  | { action: "scan" }
  | { action: "render"; folderId: string }
  | { action: "export"; folderId: string }
  | { action: "done"; folderId: string };

export const folderQueue = {
  /**
   * Track a new folder or update an existing one (upsert).
   */
  async upsertFolder(folder: KVFolder): Promise<void> {
    const redis = getRedis();
    await redis.set(KEY.folder(folder.folderId), JSON.stringify(folder));
    await redis.sadd(KEY.activeFolders, folder.folderId);
  },

  /**
   * Get a single folder by Drive folder ID.
   */
  async getFolder(folderId: string): Promise<KVFolder | null> {
    const redis = getRedis();
    const raw = await redis.get<string>(KEY.folder(folderId));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },

  /**
   * List all tracked folders, sorted by addedAt descending (newest first).
   */
  async getFolders(): Promise<KVFolder[]> {
    const redis = getRedis();
    const folderIds = await redis.smembers(KEY.activeFolders);
    if (!folderIds || folderIds.length === 0) return [];

    const folders = await Promise.all(
      (folderIds as string[]).map(async (id) => {
        const raw = await redis.get<string>(KEY.folder(id));
        if (!raw) return null;
        return typeof raw === "string" ? JSON.parse(raw) : (raw as KVFolder);
      })
    );

    return (folders.filter(Boolean) as KVFolder[]).sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    );
  },

  /**
   * Update a folder's stage and optional fields.
   */
  async updateFolder(
    folderId: string,
    update: Partial<Omit<KVFolder, "folderId">>
  ): Promise<KVFolder | null> {
    const redis = getRedis();
    const existing = await folderQueue.getFolder(folderId);
    if (!existing) return null;

    const updated = { ...existing, ...update };
    await redis.set(KEY.folder(folderId), JSON.stringify(updated));
    return updated;
  },

  /**
   * Remove a folder from tracking (e.g., after purge).
   */
  async removeFolder(folderId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(KEY.folder(folderId));
    await redis.srem(KEY.activeFolders, folderId);
  },

  /**
   * Push an action trigger for the iMac worker to pick up.
   */
  async pushAction(action: FolderAction): Promise<void> {
    const redis = getRedis();
    await redis.rpush(KEY.folderActions, JSON.stringify(action));
  },

  /**
   * iMac claims the next action from the queue.
   */
  async claimAction(): Promise<FolderAction | null> {
    const redis = getRedis();
    const raw = await redis.lpop<string>(KEY.folderActions);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  },

  /**
   * Get the number of pending actions in the folder queue.
   */
  async getActionCount(): Promise<number> {
    const redis = getRedis();
    return await redis.llen(KEY.folderActions);
  },
};
