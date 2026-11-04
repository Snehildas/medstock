import { NextResponse, type NextRequest } from "next/server";
import { localPreviewAllowed } from "./lib/preview-mode";
import { decideRequest, sessionCookieName } from "./lib/route-guard";

export function proxy(request: NextRequest) {
  const decision = decideRequest(
    request.nextUrl.pathname,
    request.cookies.get(sessionCookieName())?.value,
    localPreviewAllowed(process.env),
  );
  if (decision.kind === "continue") {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = "";
  url.searchParams.set("returnTo", decision.returnTo);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
