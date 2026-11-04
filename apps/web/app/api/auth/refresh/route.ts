import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizationHeader, safeReturnPath, tokenEndpoint } from "@/lib/cognito";
import { sameOriginMutation } from "@/lib/request-origin";
import {
  AUTH_RETRY_COOKIE,
  cookieSecure,
  openSession,
  sealSession,
  SESSION_COOKIE,
  sessionCookieMaxAge,
} from "@/lib/session";
import { loadWebAuthConfig } from "@/lib/web-auth-config";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
});

export async function GET(request: NextRequest) {
  if (
    !sameOriginMutation({
      method: request.method,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
      appOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  const config = loadWebAuthConfig(process.env);
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo") ?? undefined);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url));
  }
  if (request.cookies.get(AUTH_RETRY_COOKIE)?.value === "1") {
    return clearSession(request, "expired");
  }
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  if (!session) {
    return clearSession(request, "expired");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: session.refreshToken,
  });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  const basic = authorizationHeader(config);
  if (basic) {
    headers.set("authorization", basic);
  }
  const tokenResponse = await fetch(tokenEndpoint(config), { method: "POST", headers, body, cache: "no-store" });
  const parsed = tokenSchema.safeParse(await tokenResponse.json().catch(() => null));
  if (!tokenResponse.ok || !parsed.success) {
    return clearSession(request, "expired");
  }
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(
    SESSION_COOKIE,
    sealSession(
      {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token ?? session.refreshToken,
        expiresAt: Date.now() + parsed.data.expires_in * 1000,
      },
      config.sessionSecret,
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: sessionCookieMaxAge(),
    },
  );
  response.cookies.set(AUTH_RETRY_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60,
  });
  return response;
}

function clearSession(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?reason=${reason}`, request.url));
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(AUTH_RETRY_COOKIE);
  return response;
}
