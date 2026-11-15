import { NextResponse, type NextRequest } from "next/server";
import { logoutUrl } from "@/lib/cognito";
import { localPreviewAllowed, PREVIEW_ORGANIZATION_COOKIE } from "@/lib/preview-mode";
import { sameOriginMutation } from "@/lib/request-origin";
import { cookiesClearedOnSignOut } from "@/lib/session";
import { limitWebRequest } from "@/lib/rate-limit";
import { loadWebAuthConfig } from "@/lib/web-auth-config";

export function POST(request: NextRequest) {
  const limited = limitWebRequest(request, "auth");
  if (limited) {
    return limited;
  }
  if (!allowedMutation(request)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "This request was not sent from MedStock." } },
      { status: 403 },
    );
  }
  if (localPreviewAllowed(process.env)) {
    const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
    response.cookies.delete(PREVIEW_ORGANIZATION_COOKIE);
    return response;
  }
  const config = loadWebAuthConfig(process.env);
  const destination = config ? logoutUrl(config) : new URL("/sign-in", request.url).toString();
  const response = NextResponse.redirect(destination, { status: 303 });
  for (const name of cookiesClearedOnSignOut()) {
    response.cookies.delete(name);
  }
  return response;
}

function allowedMutation(request: NextRequest): boolean {
  return sameOriginMutation({
    method: request.method,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    appOrigin: request.nextUrl.origin,
  });
}
