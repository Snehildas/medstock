import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { demoModeEnabled } from "@medstock/shared-types";
import { authorizationHeader, safeReturnPath, tokenEndpoint } from "@/lib/cognito";
import { loadDemoWebConfig } from "@/lib/demo-mode";
import { sameOriginMutation } from "@/lib/request-origin";
import {
  AUTH_RETRY_COOKIE,
  accessTokenExpired,
  cookieSecure,
  decideRefresh,
  openSession,
  refreshFlightKey,
  refreshResult,
  sealSession,
  singleFlightRefresh,
  SESSION_COOKIE,
  sessionCookieMaxAge,
} from "@/lib/session";
import { limitWebRequest } from "@/lib/rate-limit";
import { loadWebAuthConfig } from "@/lib/web-auth-config";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
});

export async function GET(request: NextRequest) {
  const limited = limitWebRequest(request, "auth");
  if (limited) {
    return limited;
  }
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
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo") ?? undefined);
  if (demoModeEnabled(process.env)) {
    return demoRefresh(request, returnTo);
  }
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url));
  }
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  const retryAlreadyUsed = request.cookies.get(AUTH_RETRY_COOKIE)?.value === "1";
  const decision = decideRefresh({
    hasSession: session !== null,
    accessTokenStillValid: session !== null && !accessTokenExpired(session),
    retryAlreadyUsed,
  });
  if (decision === "sign-out") {
    return clearSession(request, "expired");
  }
  if (decision === "use-current-session") {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }
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
  let exchanged: { accessToken: string; refreshToken: string; expiresIn: number } | null;
  try {
    exchanged = await singleFlightRefresh(refreshFlightKey(session.refreshToken), async () => {
      const tokenResponse = await fetch(tokenEndpoint(config), { method: "POST", headers, body, cache: "no-store" });
      const parsed = tokenSchema.safeParse(await tokenResponse.json().catch(() => null));
      const outcome = refreshResult({
        networkFailed: false,
        tokenResponseOk: tokenResponse.ok,
        tokenParsed: parsed.success,
      });
      if (outcome !== "store" || !parsed.success) {
        return null;
      }
      return {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token ?? session.refreshToken,
        expiresIn: parsed.data.expires_in,
      };
    });
  } catch {
    return NextResponse.redirect(new URL("/sign-in?reason=unavailable", request.url));
  }
  if (!exchanged) {
    return clearSession(request, "expired");
  }
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set(
    SESSION_COOKIE,
    sealSession(
      {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: Date.now() + exchanged.expiresIn * 1000,
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

function demoRefresh(request: NextRequest, returnTo: string): NextResponse {
  const config = loadDemoWebConfig(process.env);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url));
  }
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  if (!session || !session.accessToken.startsWith("medstock-demo.v1.") || accessTokenExpired(session)) {
    return clearSession(request, "expired");
  }
  return NextResponse.redirect(new URL(returnTo, request.url));
}

function clearSession(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?reason=${reason}`, request.url));
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(AUTH_RETRY_COOKIE);
  return response;
}
