export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { purgeZombieTmpFiles } = await import("./scripts/startup-cleanup");
    purgeZombieTmpFiles();
  }
}
