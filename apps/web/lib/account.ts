import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUserResponseSchema, type CurrentUserResponse } from "@medstock/shared-types";
import { apiRequest } from "./api-client";
import { safeReturnPath } from "./cognito";
import { membershipForSelection, resolveOrganization, type OrganizationResolution } from "./organization";
import { previewCurrentUser, previewOrganizationId } from "./preview-data";
import { localPreviewAllowed, PREVIEW_ORGANIZATION_COOKIE } from "./preview-mode";
import { accessTokenExpired, openSession, ORGANIZATION_COOKIE, SESSION_COOKIE } from "./session";
import { loadWebAuthConfig } from "./web-auth-config";

export type AccountState = {
  user: CurrentUserResponse;
  organization: OrganizationResolution;
};

export async function readApiSession(returnTo = "/app"): Promise<{ accessToken: string; apiOrigin: string }> {
  if (localPreviewAllowed(process.env)) {
    throw new Error("Local preview does not create an API session.");
  }
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    redirect("/sign-in?reason=unconfigured");
  }
  const jar = await cookies();
  const sealed = jar.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  if (accessTokenExpired(session)) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  return { accessToken: session.accessToken, apiOrigin: config.apiOrigin };
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
  const config = loadWebAuthConfig(process.env);
  if (!config) {
    redirect("/sign-in?reason=unconfigured");
  }
  const jar = await cookies();
  const sealed = jar.get(SESSION_COOKIE)?.value;
  const session = sealed ? openSession(sealed, config.sessionSecret) : null;
  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  if (accessTokenExpired(session)) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  const result = await apiRequest({
    apiOrigin: config.apiOrigin,
    path: "/identity/me",
    accessToken: session.accessToken,
    schema: currentUserResponseSchema,
  });
  if (!result.ok && result.status === 401) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
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
    redirect("/app");
  }
  jar.set(ORGANIZATION_COOKIE, selected.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/app");
}

function membershipChoices(user: CurrentUserResponse) {
  return user.memberships.map((membership) => ({
    organizationId: membership.organizationId,
    status: membership.status,
    role: membership.role,
    organization: membership.organization,
  }));
}
