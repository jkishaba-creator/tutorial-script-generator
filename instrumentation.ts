export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { purgeZombieTmpFiles } = await import("./scripts/startup-cleanup");
    purgeZombieTmpFiles();

    // Start background queue worker
    const { startQueueWorker } = await import("./lib/queue-worker");
    startQueueWorker().catch(console.error);
  }
}
