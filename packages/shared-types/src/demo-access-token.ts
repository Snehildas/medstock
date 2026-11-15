import { createHmac, timingSafeEqual } from "node:crypto";
import { demoPersonas, type DemoPersona } from "./demo-personas.js";

export const DEMO_ACCESS_TOKEN_PREFIX = "medstock-demo.v1.";
export const DEMO_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 8;

type DemoTokenBody = {
  sub: string;
  email: string;
  name: string;
  exp: number;
};

export type VerifiedDemoAccessToken = {
  persona: DemoPersona;
  subject: string;
  email: string;
  name: string;
  expiresAt: number;
};

export function createDemoAccessToken(persona: DemoPersona, secret: string, now = Date.now()): string {
  const identity = demoPersonas[persona];
  const body = encodeBody({
    sub: identity.subject,
    email: identity.email,
    name: identity.name,
    exp: Math.floor(now / 1000) + DEMO_ACCESS_TOKEN_TTL_SECONDS,
  });
  return `${DEMO_ACCESS_TOKEN_PREFIX}${body}.${signBody(body, secret)}`;
}

export function verifyDemoAccessToken(
  token: string,
  secret: string,
  now = Date.now(),
): VerifiedDemoAccessToken | null {
  if (secret.length < 32 || !token.startsWith(DEMO_ACCESS_TOKEN_PREFIX)) {
    return null;
  }
  const rest = token.slice(DEMO_ACCESS_TOKEN_PREFIX.length);
  const split = rest.lastIndexOf(".");
  if (split <= 0) {
    return null;
  }
  const body = rest.slice(0, split);
  const mac = rest.slice(split + 1);
  const expected = signBody(body, secret);
  const provided = Buffer.from(mac);
  const calculated = Buffer.from(expected);
  if (provided.length !== calculated.length || !timingSafeEqual(provided, calculated)) {
    return null;
  }
  const parsed = decodeBody(body);
  if (!parsed) {
    return null;
  }
  if (!Number.isFinite(parsed.exp) || parsed.exp * 1000 <= now) {
    return null;
  }
  const persona = (Object.keys(demoPersonas) as DemoPersona[]).find((key) => {
    const identity = demoPersonas[key];
    return identity.subject === parsed.sub && identity.email === parsed.email && identity.name === parsed.name;
  });
  if (!persona) {
    return null;
  }
  return {
    persona,
    subject: parsed.sub,
    email: parsed.email,
    name: parsed.name,
    expiresAt: parsed.exp * 1000,
  };
}

function encodeBody(body: DemoTokenBody): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function decodeBody(body: string): DemoTokenBody | null {
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<DemoTokenBody>;
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return { sub: parsed.sub, email: parsed.email, name: parsed.name, exp: parsed.exp };
  } catch {
    return null;
  }
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
