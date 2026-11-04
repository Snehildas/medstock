import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import { readApiSession } from "./account";
import { apiRequest, type ApiFailure, type ApiSuccess } from "./api-client";
import { safeReturnPath } from "./cognito";
import { previewApiResult } from "./preview-data";
import { localPreviewAllowed } from "./preview-mode";

export async function distributorApi<T>(
  path: string,
  schema: ZodType<T>,
  init: { method?: string; body?: unknown; returnTo?: string } = {},
): Promise<ApiSuccess<T> | ApiFailure> {
  if (localPreviewAllowed(process.env)) {
    return previewApiResult(path, schema, init.method ?? "GET");
  }
  const returnTo = safeReturnPath(init.returnTo ?? "/app");
  const session = await readApiSession(returnTo);
  const result = await apiRequest({
    apiOrigin: session.apiOrigin,
    path,
    accessToken: session.accessToken,
    schema,
    ...(init.method ? { method: init.method } : {}),
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  if (!result.ok && result.status === 401) {
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return result;
}
