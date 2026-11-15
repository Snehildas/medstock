import { DEMO_ACCESS_TOKEN_PREFIX, demoModeConflict, demoModeEnabled, verifyDemoAccessToken } from "@medstock/shared-types";

export type DemoWebConfig = {
  webOrigin: string;
  apiOrigin: string;
  sessionSecret: string;
  demoTokenSecret: string;
};

const demoRequired = ["WEB_ORIGIN", "API_ORIGIN", "SESSION_SECRET", "MEDSTOCK_DEMO_TOKEN_SECRET"] as const;

export function missingDemoSettings(env: Record<string, string | undefined>): string[] {
  return demoRequired.filter((name) => {
    const value = env[name]?.trim() ?? "";
    if (name === "SESSION_SECRET" || name === "MEDSTOCK_DEMO_TOKEN_SECRET") {
      return value.length < 32;
    }
    return !isOrigin(value.replace(/\/$/, ""));
  });
}

export function loadDemoWebConfig(env: Record<string, string | undefined>): DemoWebConfig | null {
  if (!demoModeEnabled(env) || demoModeConflict(env) || missingDemoSettings(env).length > 0) {
    return null;
  }
  return {
    webOrigin: (env.WEB_ORIGIN ?? "").trim().replace(/\/$/, ""),
    apiOrigin: (env.API_ORIGIN ?? "").trim().replace(/\/$/, ""),
    sessionSecret: env.SESSION_SECRET?.trim() ?? "",
    demoTokenSecret: env.MEDSTOCK_DEMO_TOKEN_SECRET?.trim() ?? "",
  };
}

export function assertDemoModeIsolated(env: Record<string, string | undefined>): void {
  const conflict = demoModeConflict(env);
  if (conflict) {
    throw new Error(conflict);
  }
}

export function demoAccessTokenActive(token: string, secret: string, now = Date.now()): boolean {
  return token.startsWith(DEMO_ACCESS_TOKEN_PREFIX) && verifyDemoAccessToken(token, secret, now) !== null;
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.pathname === "/" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}
