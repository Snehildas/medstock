import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, createAuthState, createPkcePair, safeReturnPath } from "@/lib/cognito";
import { cookieSecure, PKCE_COOKIE, sealJson } from "@/lib/session";
import { limitWebRequest } from "@/lib/rate-limit";
import { loadWebAuthConfig } from "@/lib/web-auth-config";

export function GET(request: NextRequest) {
  const limited = limitWebRequest(request, "auth");
  if (limited) {
    return limited;
  }
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url));
  }
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo") ?? undefined);
  const pkce = createPkcePair();
  const state = createAuthState();
  const response = NextResponse.redirect(authorizeUrl(config, { state, codeChallenge: pkce.challenge }));
  response.cookies.set(PKCE_COOKIE, sealJson({ verifier: pkce.verifier, state, returnTo }, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
