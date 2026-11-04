import { apiErrorSchema } from "@medstock/shared-types";
import type { ZodType } from "zod";

export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export function authorizationHeaders(accessToken: string): Headers {
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${accessToken}`);
  return headers;
}

export async function apiRequest<T>(input: {
  apiOrigin: string;
  path: string;
  accessToken: string;
  schema: ZodType<T>;
  method?: string;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<ApiSuccess<T> | ApiFailure> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = authorizationHeaders(input.accessToken);
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  let response: Response;
  try {
    response = await fetchImpl(`${input.apiOrigin}${input.path}`, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "api_unreachable",
      message: "MedStock could not reach the API.",
    };
  }
  if (response.status === 401) {
    return {
      ok: false,
      status: 401,
      code: "invalid_identity",
      message: "Your session expired. Sign in again.",
    };
  }
  const text = await response.text();
  const parsed = parseBody(text);
  if (!response.ok) {
    return interpretHttpError(response.status, parsed);
  }
  const data = input.schema.safeParse(parsed);
  if (!data.success) {
    return {
      ok: false,
      status: response.status,
      code: "invalid_response",
      message: "The API returned an unexpected response.",
    };
  }
  return { ok: true, data: data.data };
}

export function interpretHttpError(status: number, body: unknown): ApiFailure {
  const error = apiErrorSchema.safeParse(body);
  const fieldErrors = fieldErrorsFrom(body);
  if (status === 403) {
    return {
      ok: false,
      status,
      code: error.success ? error.data.error.code : "forbidden",
      message: error.success ? error.data.error.message : "You cannot perform that action for this organization.",
      ...(fieldErrors ? { fieldErrors } : {}),
    };
  }
  if (error.success) {
    return {
      ok: false,
      status,
      code: error.data.error.code,
      message: error.data.error.message,
      ...(fieldErrors ? { fieldErrors } : {}),
    };
  }
  if (fieldErrors) {
    return {
      ok: false,
      status,
      code: "validation_error",
      message: "Check the highlighted fields.",
      fieldErrors,
    };
  }
  return {
    ok: false,
    status,
    code: "api_error",
    message: "The request could not be completed.",
  };
}

function fieldErrorsFrom(body: unknown): Record<string, string> | undefined {
  const source = nestedMessage(body);
  if (!source || typeof source !== "object" || !("fieldErrors" in source)) {
    return undefined;
  }
  const raw = source.fieldErrors;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const message = Array.isArray(value) ? value.find((item) => typeof item === "string") : undefined;
    if (typeof message === "string" && message.length > 0) {
      fields[key] = message;
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function nestedMessage(body: unknown): unknown {
  if (body && typeof body === "object" && "message" in body && typeof body.message === "object") {
    return body.message;
  }
  return body;
}

function parseBody(text: string): unknown {
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
