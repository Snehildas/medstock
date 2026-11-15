import { NextResponse, type NextRequest } from "next/server";
import { DEMO_ACCESS_TOKEN_TTL_SECONDS, createDemoAccessToken, demoModeEnabled, demoPersonaKey } from "@medstock/shared-types";
import { loadDemoWebConfig } from "@/lib/demo-mode";
import { limitWebRequest } from "@/lib/rate-limit";
import { sameOriginMutation } from "@/lib/request-origin";
import { cookieSecure, sealSession, SESSION_COOKIE } from "@/lib/session";

export function POST(request: NextRequest) {
  const limited = limitWebRequest(request, "auth");
  if (limited) {
    return limited;
  }
  if (!demoModeEnabled(process.env)) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Demo sign-in is not enabled." } },
      { status: 404 },
    );
  }
  if (
    !sameOriginMutation({
      method: request.method,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
      appOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "This request was not sent from MedStock." } },
      { status: 403 },
    );
  }
  const config = loadDemoWebConfig(process.env);
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?reason=unconfigured", request.url), { status: 303 });
  }
  return request.formData().then((form) => {
    const persona = demoPersonaKey(form.get("persona"));
    if (!persona) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Choose a demo identity from the list." } },
        { status: 400 },
      );
    }
    const issuedAt = Date.now();
    const accessToken = createDemoAccessToken(persona, config.demoTokenSecret, issuedAt);
    const response = NextResponse.redirect(new URL("/app", request.url), { status: 303 });
    response.cookies.set(
      SESSION_COOKIE,
      sealSession(
        {
          accessToken,
          refreshToken: "demo-session",
          expiresAt: issuedAt + DEMO_ACCESS_TOKEN_TTL_SECONDS * 1000,
        },
        config.sessionSecret,
      ),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieSecure() || config.webOrigin.startsWith("https://"),
        path: "/",
        maxAge: DEMO_ACCESS_TOKEN_TTL_SECONDS,
      },
    );
    return response;
  });
}
