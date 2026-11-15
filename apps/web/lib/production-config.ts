import { demoModeEnabled } from "@medstock/shared-types";
import { assertDemoModeIsolated, loadDemoWebConfig } from "./demo-mode.ts";
import { assertLocalPreviewDisabledInProduction } from "./preview-mode.ts";
import { loadWebAuthConfig } from "./web-auth-config.ts";

export function assertProductionWebConfig(env: Record<string, string | undefined>): void {
  assertDemoModeIsolated(env);
  assertLocalPreviewDisabledInProduction(env);
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.AUTH_DEV_MODE === "true") {
    throw new Error("AUTH_DEV_MODE cannot be enabled when NODE_ENV is production.");
  }
  if (demoModeEnabled(env)) {
    const demo = loadDemoWebConfig(env);
    if (!demo || !demo.webOrigin.startsWith("https://")) {
      throw new Error("Demo web configuration is required when MEDSTOCK_DEMO_MODE is true.");
    }
    return;
  }
  const config = loadWebAuthConfig(env);
  if (!config || !config.webOrigin.startsWith("https://")) {
    throw new Error("Web authentication configuration is required when NODE_ENV is production.");
  }
}
