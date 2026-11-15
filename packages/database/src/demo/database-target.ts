const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export type DemoDatabaseDecision = { ok: true } | { ok: false; reason: string };

export function evaluateDemoDatabaseUrl(connectionString: string): DemoDatabaseDecision {
  const parsed = parseConnection(connectionString);
  if (!parsed.ok) {
    return parsed;
  }
  if (localHosts.has(parsed.host) || parsed.host.endsWith(".localhost")) {
    return { ok: false, reason: "Refusing a local database host." };
  }
  if (parsed.port === "5433") {
    return { ok: false, reason: "Refusing a local database port." };
  }
  if (!parsed.host.endsWith(".neon.tech")) {
    return { ok: false, reason: "Demo database host must be a Neon host." };
  }
  if (parsed.database !== "medstock_demo") {
    return { ok: false, reason: "Demo database name must be medstock_demo." };
  }
  return { ok: true };
}

export function evaluateDemoDatabase(input: {
  connectionString: string;
  currentDatabase: string;
}): DemoDatabaseDecision {
  const urlDecision = evaluateDemoDatabaseUrl(input.connectionString);
  if (!urlDecision.ok) {
    return urlDecision;
  }
  if (input.currentDatabase !== "medstock_demo") {
    return { ok: false, reason: "Connected database is not medstock_demo." };
  }
  return { ok: true };
}

function parseConnection(
  connectionString: string,
): { ok: true; host: string; port: string; database: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid connection string." };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (host.length === 0 || database.length === 0) {
    return { ok: false, reason: "DATABASE_URL is missing a host or database name." };
  }
  return { ok: true, host, port: url.port, database };
}
