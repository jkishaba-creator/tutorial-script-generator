/**
 * Job Queue — In-memory concurrency limiter for video processing.
 *
 * Uses p-queue with concurrency of 1 to ensure only one FFmpeg render
 * runs at a time on this M1 iMac. This keeps the CPU cool and prevents
 * the 20 Mbps upload from fighting itself.
 *
 * If the app restarts, Smart Skip ensures already-finished videos are
 * not reprocessed, so an in-memory queue is perfectly safe.
 */

import PQueue from "p-queue";

export interface JobProgress {
  /** Unique job ID */
  jobId: string;
  /** Name of the video file being processed */
  videoName: string;
  /** Current status */
  status: "queued" | "downloading" | "processing" | "uploading" | "done" | "error" | "skipped";
  /** FFmpeg render progress (0-100) */
  renderPercent: number;
  /** Error message if status is "error" */
  error?: string;
  /** Position in the batch, e.g. "12/80" */
  batchPosition?: string;
}

/** Global progress state — keyed by batchId, contains array of job progress */
const progressStore = new Map<string, JobProgress[]>();

/** The single global processing queue — concurrency of 1 */
const processingQueue = new PQueue({ concurrency: 1 });

export function getQueue(): PQueue {
  return processingQueue;
}

// ── Progress Store helpers ──────────────────────────────────────────

export function initBatchProgress(batchId: string, jobs: JobProgress[]): void {
  progressStore.set(batchId, jobs);
}

export function getBatchProgress(batchId: string): JobProgress[] | undefined {
  return progressStore.get(batchId);
}

export function updateJobProgress(
  batchId: string,
  jobId: string,
  update: Partial<JobProgress>
): void {
  const batch = progressStore.get(batchId);
  if (!batch) return;

  const job = batch.find((j) => j.jobId === jobId);
  if (job) {
    Object.assign(job, update);
  }
}

export function cleanupBatchProgress(batchId: string): void {
  // Keep progress around for 5 minutes after completion so clients can poll
  setTimeout(() => {
    progressStore.delete(batchId);
  }, 5 * 60 * 1000);
}
