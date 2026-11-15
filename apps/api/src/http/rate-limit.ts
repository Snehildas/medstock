export type RateLimitClass =
  | "health"
  | "upload"
  | "search"
  | "enquiry"
  | "auth"
  | "listing"
  | "submission"
  | "mutation"
  | "default";

export type RateLimitEnv = Record<string, string | undefined>;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimitEnabled(env: RateLimitEnv): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }
  if (env.NODE_ENV === "production") {
    return true;
  }
  return env.RATE_LIMIT_DISABLED !== "true";
}

export function trustedProxyHops(env: RateLimitEnv): number {
  const raw = Number(env.RATE_LIMIT_TRUSTED_PROXY_HOPS ?? "0");
  if (!Number.isInteger(raw) || raw < 0 || raw > 3) {
    return 0;
  }
  return raw;
}

export function clientAddress(input: {
  remoteAddress: string | undefined;
  forwardedFor: string | undefined;
  trustedProxyHops: number;
}): string {
  const remote = input.remoteAddress?.trim() || "unknown";
  if (input.trustedProxyHops <= 0) {
    return remote;
  }
  const parts = (input.forwardedFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 80);
  const index = parts.length - input.trustedProxyHops;
  return parts[index] ?? remote;
}

export function apiLimitClass(method: string, path: string): RateLimitClass {
  const pathname = path.split("?")[0] ?? path;
  const verb = method.toUpperCase();
  if (pathname === "/health" || pathname.startsWith("/health/")) {
    return "health";
  }
  if (verb === "POST" && pathname === "/distributor/imports") {
    return "upload";
  }
  if (verb === "GET" && (pathname === "/catalog/medicines" || pathname.startsWith("/catalog/medicines/"))) {
    return "search";
  }
  if (verb === "POST" && pathname === "/retailer/enquiries") {
    return "enquiry";
  }
  if (isMutation(verb) && pathname.includes("/medicine-submissions")) {
    return "submission";
  }
  if (isMutation(verb) && pathname.includes("/listings")) {
    return "listing";
  }
  if (isMutation(verb)) {
    return "mutation";
  }
  return "default";
}

export function limitFor(env: RateLimitEnv, kind: RateLimitClass): number {
  const production = env.NODE_ENV === "production";
  const defaults: Record<RateLimitClass, number> = production
    ? {
        health: 120,
        upload: 10,
        search: 60,
        enquiry: 20,
        auth: 30,
        listing: 60,
        submission: 20,
        mutation: 60,
        default: 300,
      }
    : {
        health: 600,
        upload: 120,
        search: 600,
        enquiry: 120,
        auth: 300,
        listing: 600,
        submission: 120,
        mutation: 600,
        default: 1200,
      };
  const names: Record<RateLimitClass, string> = {
    health: "RATE_LIMIT_HEALTH",
    upload: "RATE_LIMIT_UPLOAD",
    search: "RATE_LIMIT_SEARCH",
    enquiry: "RATE_LIMIT_ENQUIRY",
    auth: "RATE_LIMIT_AUTH",
    listing: "RATE_LIMIT_LISTING",
    submission: "RATE_LIMIT_SUBMISSION",
    mutation: "RATE_LIMIT_MUTATION",
    default: "RATE_LIMIT_DEFAULT",
  };
  return positiveInteger(env[names[kind]], defaults[kind]);
}

export function windowMs(env: RateLimitEnv): number {
  return positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60_000);
}

export function takeRateLimit(input: {
  kind: RateLimitClass;
  address: string;
  limit: number;
  now: number;
  windowMs: number;
}): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  pruneBuckets(input.now);
  const key = `${input.kind}:${input.address}`;
  const current = buckets.get(key);
  if (!current || input.now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: input.now + input.windowMs });
    return { allowed: true };
  }
  if (current.count >= input.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - input.now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true };
}

export function resetRateLimits(): void {
  buckets.clear();
}

function isMutation(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100_000) {
    return fallback;
  }
  return parsed;
}

function pruneBuckets(now: number): void {
  if (buckets.size < 5000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
