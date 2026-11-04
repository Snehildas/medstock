export async function register(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  const { assertProductionWebConfig } = await import("./lib/production-config");
  assertProductionWebConfig(process.env);
}
