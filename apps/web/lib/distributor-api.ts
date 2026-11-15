import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { demoModeEnabled } from "@medstock/shared-types";
import type { ZodType } from "zod";
import { readApiSession } from "./account";
import { apiRequest, type ApiFailure, type ApiSuccess } from "./api-client";
import { safeReturnPath } from "./cognito";
import { previewApiResult } from "./preview-data";
import { localPreviewAllowed } from "./preview-mode";
import { limitApiPath } from "./rate-limit";

export async function distributorApi<T>(
  path: string,
  schema: ZodType<T>,
  init: { method?: string; body?: unknown; returnTo?: string } = {},
): Promise<ApiSuccess<T> | ApiFailure> {
  if (localPreviewAllowed(process.env)) {
    return previewApiResult(path, schema, init.method ?? "GET");
  }
  const method = init.method ?? "GET";
  const limited = limitApiPath(method, path, await forwardedFor());
  if (limited) {
    return limited;
  }
  const returnTo = safeReturnPath(init.returnTo ?? "/app");
  const session = await readApiSession(returnTo);
  const result = await apiRequest({
    apiOrigin: session.apiOrigin,
    path,
    accessToken: session.accessToken,
    schema,
    ...(method !== "GET" ? { method } : {}),
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  if (!result.ok && result.status === 401) {
    const destination = encodeURIComponent(returnTo);
    redirect(
      demoModeEnabled(process.env)
        ? `/sign-in?reason=expired&returnTo=${destination}`
        : `/api/auth/refresh?returnTo=${destination}`,
    );
  }
  return result;
}

async function forwardedFor(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-forwarded-for") ?? undefined;
  } catch {
    return undefined;
  }
}
