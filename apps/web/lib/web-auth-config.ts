const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
const clientIdPattern = /^[A-Za-z0-9]{20,128}$/;
const domainPattern = /^[a-z0-9.-]+\.[a-z]{2,}$/;

export type WebAuthConfig = {
  region: string;
  userPoolId: string;
  clientId: string;
  domain: string;
  webOrigin: string;
  apiOrigin: string;
  sessionSecret: string;
  clientSecret?: string;
};

const requiredNames = [
  "COGNITO_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_DOMAIN",
  "WEB_ORIGIN",
  "API_ORIGIN",
  "SESSION_SECRET",
] as const;

export function missingWebAuthSettings(env: Record<string, string | undefined>): string[] {
  return requiredNames.filter((name) => {
    const value = env[name]?.trim() ?? "";
    if (name === "SESSION_SECRET") {
      return value.length < 32;
    }
    return value.length === 0;
  });
}

export function loadWebAuthConfig(env: Record<string, string | undefined>): WebAuthConfig | null {
  if (missingWebAuthSettings(env).length > 0) {
    return null;
  }
  const region = env.COGNITO_REGION?.trim() ?? "";
  const userPoolId = env.COGNITO_USER_POOL_ID?.trim() ?? "";
  const clientId = env.COGNITO_CLIENT_ID?.trim() ?? "";
  const domain = (env.COGNITO_DOMAIN?.trim() ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const webOrigin = trimOrigin(env.WEB_ORIGIN ?? "");
  const apiOrigin = trimOrigin(env.API_ORIGIN ?? "");
  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  const clientSecret = env.COGNITO_CLIENT_SECRET?.trim() ?? "";
  if (!regionPattern.test(region) || !userPoolId.startsWith(`${region}_`)) {
    return null;
  }
  if (!clientIdPattern.test(clientId) || !domainPattern.test(domain)) {
    return null;
  }
  if (!isOrigin(webOrigin) || !isOrigin(apiOrigin)) {
    return null;
  }
  return {
    region,
    userPoolId,
    clientId,
    domain,
    webOrigin,
    apiOrigin,
    sessionSecret,
    ...(clientSecret.length > 0 ? { clientSecret } : {}),
  };
}

export function callbackUrl(config: WebAuthConfig): string {
  return `${config.webOrigin}/api/auth/callback`;
}

export function signInUrl(config: WebAuthConfig): string {
  return `${config.webOrigin}/sign-in`;
}

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
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
