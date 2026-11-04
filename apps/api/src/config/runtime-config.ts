export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigError";
  }
}

export function assertRuntimeConfig(env: Record<string, string | undefined>): void {
  if (!env.DATABASE_URL?.trim()) {
    throw new RuntimeConfigError("DATABASE_URL is required.");
  }
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.AUTH_DEV_MODE === "true") {
    throw new RuntimeConfigError("AUTH_DEV_MODE cannot be enabled when NODE_ENV is production.");
  }
  const origin = env.WEB_ORIGIN?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new RuntimeConfigError("WEB_ORIGIN must be one https origin when NODE_ENV is production.");
  }
  if (origin === "*" || parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.username.length > 0) {
    throw new RuntimeConfigError("WEB_ORIGIN must be one https origin when NODE_ENV is production.");
  }
}
