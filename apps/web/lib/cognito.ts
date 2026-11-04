import { createHash, randomBytes } from "node:crypto";
import { callbackUrl, signInUrl, type WebAuthConfig } from "./web-auth-config.ts";

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function authorizeUrl(config: WebAuthConfig, input: { state: string; codeChallenge: string }): string {
  const url = new URL(`https://${config.domain}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(config));
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function logoutUrl(config: WebAuthConfig): string {
  const url = new URL(`https://${config.domain}/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("logout_uri", signInUrl(config));
  return url.toString();
}

export function tokenEndpoint(config: WebAuthConfig): string {
  return `https://${config.domain}/oauth2/token`;
}

export function authorizationHeader(config: WebAuthConfig): string | null {
  if (!config.clientSecret) {
    return null;
  }
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/app";
  }
  if (value.startsWith("/sign-in") || value.startsWith("/api/")) {
    return "/app";
  }
  return value;
}
