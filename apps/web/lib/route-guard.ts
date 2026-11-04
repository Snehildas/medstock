import { SESSION_COOKIE } from "./session.ts";

export type RouteDecision =
  | { kind: "continue" }
  | { kind: "redirect"; pathname: "/sign-in"; returnTo: string };

export function decideRequest(
  pathname: string,
  sessionCookie: string | undefined,
  localPreview = false,
): RouteDecision {
  if (!pathname.startsWith("/app")) {
    return { kind: "continue" };
  }
  if (localPreview) {
    return { kind: "continue" };
  }
  if (!sessionCookie) {
    return { kind: "redirect", pathname: "/sign-in", returnTo: pathname };
  }
  return { kind: "continue" };
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}
