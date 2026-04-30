export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Startup cleanup — purge orphaned tmp files
    const { purgeZombieTmpFiles } = await import("./scripts/startup-cleanup");
    purgeZombieTmpFiles();

    // Queue Worker — only runs on iMac, NEVER on Vercel
    // The VERCEL env var is automatically set by Vercel's build system
    if (!process.env.VERCEL) {
      console.log("[Instrumentation] iMac detected — starting Queue Worker...");
      const { startQueueWorker } = await import("./lib/queue-worker");
      startQueueWorker().catch((err: Error) => {
        console.error("[Instrumentation] Queue Worker failed to start:", err);
      });
    } else {
      console.log("[Instrumentation] Vercel environment detected — Queue Worker disabled.");
    }
  }
}
