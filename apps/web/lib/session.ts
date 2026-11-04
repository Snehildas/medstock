import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "medstock_session";
export const ORGANIZATION_COOKIE = "medstock_organization";
export const PKCE_COOKIE = "medstock_pkce";
export const AUTH_RETRY_COOKIE = "medstock_auth_retry";

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type PkcePayload = {
  verifier: string;
  state: string;
  returnTo: string;
};

const version = "v1";

export function sealJson(payload: unknown, secret: string): string {
  const key = sessionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  );
}

export function openJson<T>(sealed: string, secret: string): T | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== version) {
    return null;
  }
  const iv = parts[1];
  const tag = parts[2];
  const ciphertext = parts[3];
  if (!iv || !tag || !ciphertext) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch {
    return null;
  }
}

export function sealSession(payload: SessionPayload, secret: string): string {
  return sealJson(payload, secret);
}

export function openSession(sealed: string, secret: string): SessionPayload | null {
  const payload = openJson<SessionPayload>(sealed, secret);
  if (!payload?.accessToken || !payload.refreshToken || typeof payload.expiresAt !== "number") {
    return null;
  }
  return payload;
}

export function accessTokenExpired(session: SessionPayload, now = Date.now()): boolean {
  return session.expiresAt <= now;
}

function sessionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function sessionCookieMaxAge(): number {
  return 60 * 60 * 24 * 30;
}

export function cookiesClearedOnSignOut(): string[] {
  return [SESSION_COOKIE, PKCE_COOKIE, AUTH_RETRY_COOKIE, ORGANIZATION_COOKIE];
}

export function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}
