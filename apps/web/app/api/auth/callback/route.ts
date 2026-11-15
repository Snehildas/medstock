import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizationHeader, safeReturnPath, tokenEndpoint } from "@/lib/cognito";
import {
  AUTH_RETRY_COOKIE,
  cookieSecure,
  openJson,
  PKCE_COOKIE,
  sealSession,
  SESSION_COOKIE,
  sessionCookieMaxAge,
  type PkcePayload,
} from "@/lib/session";
import { limitWebRequest } from "@/lib/rate-limit";
import { callbackUrl, loadWebAuthConfig } from "@/lib/web-auth-config";

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
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const sealed = request.cookies.get(PKCE_COOKIE)?.value;
  const pkce = sealed ? openJson<PkcePayload>(sealed, config.sessionSecret) : null;
  if (!code || !state || !pkce || pkce.state !== state || !pkce.verifier) {
    return signInRedirect(request, "callback");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: callbackUrl(config),
    code_verifier: pkce.verifier,
  });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  const basic = authorizationHeader(config);
  if (basic) {
    headers.set("authorization", basic);
  }
  const tokenResponse = await fetch(tokenEndpoint(config), { method: "POST", headers, body, cache: "no-store" });
  const parsed = tokenSchema.safeParse(await tokenResponse.json().catch(() => null));
  if (!tokenResponse.ok || !parsed.success || !parsed.data.refresh_token) {
    return signInRedirect(request, "callback");
  }
  const destination = new URL(safeReturnPath(pkce.returnTo), request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(
    SESSION_COOKIE,
    sealSession(
      {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
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
  response.cookies.delete(PKCE_COOKIE);
  response.cookies.delete(AUTH_RETRY_COOKIE);
  return response;
}

function signInRedirect(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?reason=${reason}`, request.url));
  response.cookies.delete(PKCE_COOKIE);
  return response;
}
