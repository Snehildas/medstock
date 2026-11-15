import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUserResponseSchema, demoModeEnabled, type CurrentUserResponse } from "@medstock/shared-types";
import { apiRequest } from "./api-client";
import { safeReturnPath } from "./cognito";
import { loadDemoWebConfig } from "./demo-mode";
import { membershipForSelection, resolveOrganization, workspaceLanding, type OrganizationResolution } from "./organization";
import { previewCurrentUser, previewOrganizationId } from "./preview-data";
import { localPreviewAllowed, PREVIEW_ORGANIZATION_COOKIE } from "./preview-mode";
import { accessTokenExpired, openSession, ORGANIZATION_COOKIE, SESSION_COOKIE, type SessionPayload } from "./session";
import { loadWebAuthConfig } from "./web-auth-config";

export type AccountState = {
  user: CurrentUserResponse;
  organization: OrganizationResolution;
};

export async function readApiSession(returnTo = "/app"): Promise<{ accessToken: string; apiOrigin: string }> {
  if (localPreviewAllowed(process.env)) {
    throw new Error("Local preview does not create an API session.");
  }
  const active = openActiveSession(await cookies());
  if (active.kind === "missing-config") {
    redirect("/sign-in?reason=unconfigured");
  }
  if (active.kind === "signed-out") {
    redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  if (active.kind === "expired") {
    redirect(expiredDestination(returnTo));
  }
  return { accessToken: active.session.accessToken, apiOrigin: active.apiOrigin };
}

export async function loadAccountState(returnTo = "/app"): Promise<AccountState> {
  if (localPreviewAllowed(process.env)) {
    const jar = await cookies();
    const organizationId = previewOrganizationId(jar.get(PREVIEW_ORGANIZATION_COOKIE)?.value);
    return {
      user: previewCurrentUser,
      organization: resolveOrganization(membershipChoices(previewCurrentUser), organizationId),
    };
  }
  const jar = await cookies();
  const active = openActiveSession(jar);
  if (active.kind === "missing-config") {
    redirect("/sign-in?reason=unconfigured");
  }
  if (active.kind === "signed-out") {
    redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  if (active.kind === "expired") {
    redirect(expiredDestination(returnTo));
  }
  const result = await apiRequest({
    apiOrigin: active.apiOrigin,
    path: "/identity/me",
    accessToken: active.session.accessToken,
    schema: currentUserResponseSchema,
  });
  if (!result.ok && result.status === 401) {
    redirect(expiredDestination(returnTo));
  }
  if (!result.ok) {
    throw new Error(result.message);
  }
  return {
    user: result.data,
    organization: resolveOrganization(membershipChoices(result.data), jar.get(ORGANIZATION_COOKIE)?.value),
  };
}

export async function selectOrganization(formData: FormData): Promise<void> {
  "use server";
  const organizationId = String(formData.get("organizationId") ?? "");
  const account = await loadAccountState();
  const selected = membershipForSelection(membershipChoices(account.user), organizationId);
  if (!selected) {
    redirect("/app?notice=organization");
  }
  const jar = await cookies();
  if (localPreviewAllowed(process.env)) {
    jar.set(PREVIEW_ORGANIZATION_COOKIE, selected.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    redirect(workspaceLanding(selected.organization.type));
  }
  jar.set(ORGANIZATION_COOKIE, selected.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(workspaceLanding(selected.organization.type));
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

type ActiveSession =
  | { kind: "missing-config" }
  | { kind: "signed-out" }
  | { kind: "expired" }
  | { kind: "ready"; session: SessionPayload; apiOrigin: string };

function openActiveSession(jar: CookieJar): ActiveSession {
  if (demoModeEnabled(process.env)) {
    const demo = loadDemoWebConfig(process.env);
    if (!demo) {
      return { kind: "missing-config" };
    }
    const sealed = jar.get(SESSION_COOKIE)?.value;
    const session = sealed ? openSession(sealed, demo.sessionSecret) : null;
    if (!session || !session.accessToken.startsWith("medstock-demo.v1.")) {
      return { kind: "signed-out" };
    }
    if (accessTokenExpired(session)) {
      return { kind: "expired" };
    }
    return { kind: "ready", session, apiOrigin: demo.apiOrigin };
  }
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    return { kind: "missing-config" };
  }
  const sealed = jar.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  if (!session) {
    return { kind: "signed-out" };
  }
  if (accessTokenExpired(session)) {
    return { kind: "expired" };
  }
  return { kind: "ready", session, apiOrigin: config.apiOrigin };
}

function expiredDestination(returnTo: string): string {
  const destination = encodeURIComponent(safeReturnPath(returnTo));
  if (demoModeEnabled(process.env)) {
    return `/sign-in?reason=expired&returnTo=${destination}`;
  }
  return `/api/auth/refresh?returnTo=${destination}`;
}

function membershipChoices(user: CurrentUserResponse) {
  return user.memberships.map((membership) => ({
    organizationId: membership.organizationId,
    status: membership.status,
    role: membership.role,
    organization: membership.organization,
  }));
}
